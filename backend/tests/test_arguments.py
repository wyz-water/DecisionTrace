import json
import os
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.argument import Argument
from app.models.candidate import Candidate
from app.models.decision import Decision
from app.models.discussion import Discussion
from app.models.project import Project
from app.routes.arguments import resolve_argument
from app.routes.candidates import confirm_candidate, extract_from_discussion
from app.routes.decisions import get_decision_deliberation
from app.routes.discussions import delete_discussion
from app.routes.projects import delete_project
from app.routes.search import search
from app.schemas.argument import ArgumentResolve
from app.services.deliberation import contested_decision_ids
from app.services.pagination import PageParams


class ArgumentExtractionTests(unittest.TestCase):
    """Rule extraction of arguments (English + Chinese) and the
    deliberation layer: candidates confirm into Argument records, and
    "contested" is computed from open objections, never stored."""

    def setUp(self):
        # Extraction must never hit the LLM in tests.
        os.environ.pop("DEEPSEEK_API_KEY", None)

        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.project = Project(name="Arguments test", description="temporary")
        self.db.add(self.project)
        self.db.flush()

        self.decision = Decision(
            project_id=self.project.id,
            title="Use Redis",
            rationale="Faster reads",
            status="CONFIRMED",
        )
        self.db.add(self.decision)
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def add_discussion(self, content):
        discussion = Discussion(
            project_id=self.project.id,
            title="Meeting",
            content=content,
        )
        self.db.add(discussion)
        self.db.flush()
        return discussion

    def extract(self, content):
        discussion = self.add_discussion(content)
        result = extract_from_discussion(discussion.id, db=self.db)
        return discussion, result

    def arguments_of(self, content):
        _, result = self.extract(content)
        return [
            item
            for item in result["candidates"]
            if item["candidate_type"] == "ARGUMENT"
        ]

    # ---- Rule extraction ---------------------------------------------

    def test_english_objection_with_target_and_reason(self):
        arguments = self.arguments_of(
            "Bob disagrees with using Redis because it is complex."
        )

        self.assertEqual(len(arguments), 1)

        payload = arguments[0]["payload"]

        self.assertEqual(payload["stance"], "AGAINST")
        self.assertEqual(payload["author"], "Bob")
        self.assertEqual(payload["target_title"], "using Redis")
        self.assertEqual(payload["claim"], "it is complex")

    def test_english_self_objection_is_free_standing(self):
        arguments = self.arguments_of(
            "I disagree with using Redis. We are not convinced about the plan."
        )

        self.assertEqual(len(arguments), 2)

        for item in arguments:
            self.assertEqual(item["payload"]["stance"], "AGAINST")
            self.assertIsNone(item["payload"]["author"])
            self.assertIsNone(item["payload"]["target_title"])

    def test_english_worry_becomes_against_argument(self):
        arguments = self.arguments_of(
            "I worry that Redis adds complexity to the deploy."
        )

        self.assertEqual(len(arguments), 1)
        self.assertEqual(arguments[0]["payload"]["stance"], "AGAINST")

    def test_but_without_doubt_keyword_is_not_an_argument(self):
        arguments = self.arguments_of(
            "But we also fixed the documentation yesterday."
        )

        self.assertEqual(arguments, [])

    def test_but_with_risk_keyword_is_an_argument(self):
        arguments = self.arguments_of(
            "But the migration risk is too high for this sprint."
        )

        self.assertEqual(len(arguments), 1)
        self.assertEqual(arguments[0]["payload"]["stance"], "AGAINST")

    def test_english_agreement_is_a_for_argument(self):
        arguments = self.arguments_of(
            "Ann agrees with using Redis because it scales well."
        )

        self.assertEqual(len(arguments), 1)
        self.assertEqual(arguments[0]["payload"]["stance"], "FOR")
        self.assertEqual(arguments[0]["payload"]["author"], "Ann")
        self.assertEqual(arguments[0]["payload"]["target_title"], "using Redis")

    def test_chinese_objection(self):
        arguments = self.arguments_of("王芳反对这个方案。我不同意使用 Redis。")

        self.assertEqual(len(arguments), 2)

        payloads = [item["payload"] for item in arguments]

        self.assertEqual(payloads[0]["stance"], "AGAINST")
        self.assertEqual(payloads[0]["author"], "王芳")
        self.assertEqual(payloads[1]["stance"], "AGAINST")
        self.assertIsNone(payloads[1]["author"])

    def test_chinese_worry(self):
        arguments = self.arguments_of("王芳担心迁移风险太大。")

        self.assertEqual(len(arguments), 1)
        self.assertEqual(arguments[0]["payload"]["stance"], "AGAINST")
        self.assertEqual(arguments[0]["payload"]["author"], "王芳")

    def test_chinese_agreement(self):
        arguments = self.arguments_of("我同意先迁移数据。")

        self.assertEqual(len(arguments), 1)
        self.assertEqual(arguments[0]["payload"]["stance"], "FOR")

    def test_noise_author_is_dropped(self):
        # "我们" is not a person.
        arguments = self.arguments_of("我们担心成本太高。")

        self.assertEqual(len(arguments), 1)
        self.assertIsNone(arguments[0]["payload"]["author"])

    def test_summary_carries_arguments(self):
        discussion = self.add_discussion(
            "I disagree with using Redis because it is complex."
        )
        result = extract_from_discussion(discussion.id, db=self.db)

        self.assertEqual(len(result["summary"]["arguments"]), 1)
        self.assertIn("AGAINST", result["summary"]["arguments"][0])

    # ---- Confirmation and computed contested state -------------------

    def _pending_argument(self, payload, discussion):
        candidate = Candidate(
            project_id=self.project.id,
            discussion_id=discussion.id,
            candidate_type="ARGUMENT",
            payload=json.dumps(payload),
            source_text="test sentence",
            status="PENDING",
        )
        self.db.add(candidate)
        self.db.flush()
        return candidate

    def test_confirmed_objection_makes_decision_contested(self):
        discussion = self.add_discussion("placeholder")
        candidate = self._pending_argument(
            {
                "stance": "AGAINST",
                "claim": "it is complex",
                "author": "Bob",
                "target_title": "Use Redis",
            },
            discussion,
        )

        confirm_candidate(candidate.id, db=self.db)

        argument = self.db.query(Argument).first()
        self.assertIsNotNone(argument)
        self.assertEqual(argument.decision_id, self.decision.id)
        self.assertEqual(argument.status, "OPEN")

        deliberation = get_decision_deliberation(self.decision.id, db=self.db)

        self.assertTrue(deliberation["contested"])
        self.assertEqual(len(deliberation["arguments"]), 1)

    def test_resolving_the_objection_clears_contested(self):
        discussion = self.add_discussion("placeholder")
        candidate = self._pending_argument(
            {
                "stance": "AGAINST",
                "claim": "it is complex",
                "author": "Bob",
                "target_title": "Use Redis",
            },
            discussion,
        )
        confirm_candidate(candidate.id, db=self.db)

        argument = self.db.query(Argument).first()

        resolve_argument(
            argument.id,
            ArgumentResolve(
                status="RESOLVED",
                resolved_reason="We accepted the complexity after load test",
            ),
            db=self.db,
        )

        deliberation = get_decision_deliberation(self.decision.id, db=self.db)

        self.assertFalse(deliberation["contested"])
        self.assertEqual(
            deliberation["arguments"][0].resolved_reason,
            "We accepted the complexity after load test",
        )

    def test_resolving_requires_a_reason(self):
        discussion = self.add_discussion("placeholder")
        candidate = self._pending_argument(
            {
                "stance": "AGAINST",
                "claim": "it is complex",
                "target_title": "Use Redis",
            },
            discussion,
        )
        confirm_candidate(candidate.id, db=self.db)

        argument = self.db.query(Argument).first()

        with self.assertRaises(HTTPException) as raised:
            resolve_argument(
                argument.id,
                ArgumentResolve(status="RESOLVED", resolved_reason="  "),
                db=self.db,
            )

        self.assertEqual(
            raised.exception.detail,
            "Resolving an argument requires a reason",
        )

    def test_for_argument_never_makes_contested(self):
        discussion = self.add_discussion("placeholder")
        candidate = self._pending_argument(
            {
                "stance": "FOR",
                "claim": "it scales well",
                "author": "Ann",
                "target_title": "Use Redis",
            },
            discussion,
        )
        confirm_candidate(candidate.id, db=self.db)

        deliberation = get_decision_deliberation(self.decision.id, db=self.db)

        self.assertFalse(deliberation["contested"])

    def test_target_link_tolerates_extractor_cleaning(self):
        # "disagrees with using Redis" links to the decision titled
        # "Use Redis": the extractor cleans leading verbs off titles.
        discussion = self.add_discussion("placeholder")
        candidate = self._pending_argument(
            {
                "stance": "AGAINST",
                "claim": "it is complex",
                "author": "Bob",
                "target_title": "using Redis",
            },
            discussion,
        )

        confirm_candidate(candidate.id, db=self.db)

        argument = self.db.query(Argument).first()
        self.assertEqual(argument.decision_id, self.decision.id)

    def test_unknown_target_is_refused_at_confirmation(self):
        discussion = self.add_discussion("placeholder")
        candidate = self._pending_argument(
            {
                "stance": "AGAINST",
                "claim": "it is complex",
                "target_title": "Switch to MongoDB",
            },
            discussion,
        )

        with self.assertRaises(HTTPException) as raised:
            confirm_candidate(candidate.id, db=self.db)

        self.assertIn("not found", raised.exception.detail)

    def test_contested_service_ignores_free_standing_arguments(self):
        argument = Argument(
            project_id=self.project.id,
            discussion_id=None,
            decision_id=None,
            stance="AGAINST",
            claim="free-standing concern",
            status="OPEN",
        )

        self.assertEqual(contested_decision_ids([argument]), set())

    def test_search_covers_arguments(self):
        discussion = self.add_discussion("placeholder")
        candidate = self._pending_argument(
            {
                "stance": "AGAINST",
                "claim": "it is complex",
                "author": "Bob",
                "target_title": "Use Redis",
            },
            discussion,
        )
        confirm_candidate(candidate.id, db=self.db)

        result = search(
            q="complex",
            project_id=self.project.id,
            page=PageParams(limit=20, offset=0),
            db=self.db,
        )

        kinds = [item.kind for item in result["items"]]
        self.assertIn("argument", kinds)

        argument = next(
            item for item in result["items"] if item.kind == "argument"
        )
        self.assertEqual(argument.owner, "Bob")
        self.assertEqual(argument.decision_id, self.decision.id)

    def test_project_deletion_cascades_arguments(self):
        discussion = self.add_discussion("placeholder")
        candidate = self._pending_argument(
            {
                "stance": "AGAINST",
                "claim": "it is complex",
                "target_title": "Use Redis",
            },
            discussion,
        )
        confirm_candidate(candidate.id, db=self.db)

        delete_project(self.project.id, db=self.db)

        remaining = self.db.query(Argument).filter(
            Argument.project_id == self.project.id
        ).count()

        self.assertEqual(remaining, 0)

    def test_discussion_deletion_keeps_argument_without_pointer(self):
        discussion = self.add_discussion("placeholder")
        candidate = self._pending_argument(
            {
                "stance": "AGAINST",
                "claim": "it is complex",
                "target_title": "Use Redis",
            },
            discussion,
        )
        confirm_candidate(candidate.id, db=self.db)

        delete_discussion(discussion.id, db=self.db)

        # The argument is authoritative, same as a confirmed decision:
        # it survives, only the pointer to the deleted source is cleared.
        argument = self.db.query(Argument).first()

        self.assertIsNotNone(argument)
        self.assertIsNone(argument.discussion_id)
        self.assertEqual(argument.decision_id, self.decision.id)

    def test_contested_service_counts_only_open_against(self):
        open_against = Argument(
            project_id=self.project.id,
            decision_id=self.decision.id,
            stance="AGAINST",
            claim="objection",
            status="OPEN",
        )
        resolved = Argument(
            project_id=self.project.id,
            decision_id=self.decision.id,
            stance="AGAINST",
            claim="old objection",
            status="RESOLVED",
        )
        supporting = Argument(
            project_id=self.project.id,
            decision_id=self.decision.id,
            stance="FOR",
            claim="support",
            status="OPEN",
        )

        contested = contested_decision_ids(
            [open_against, resolved, supporting]
        )

        self.assertEqual(contested, {self.decision.id})
