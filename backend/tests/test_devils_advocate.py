import json
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.argument import Argument
from app.models.candidate import Candidate
from app.models.decision import Decision
from app.models.discussion import Discussion
from app.models.project import Project
from app.routes.candidates import (
    confirm_candidate,
    get_candidate_challenges,
)
from app.routes.decisions import update_decision
from app.schemas.candidate import (
    CandidateConfirmRequest,
    ChallengeResolution,
)
from app.schemas.decision import DecisionUpdate
from app.services.devils_advocate import draft_challenges, titles_similar


def make_candidate(project_id, discussion_id, candidate_type, payload,
                   source_text=None, status="PENDING"):
    return Candidate(
        project_id=project_id,
        discussion_id=discussion_id,
        candidate_type=candidate_type,
        payload=json.dumps(payload),
        source_text=source_text,
        status=status,
    )


def make_decision_candidate(project_id, discussion_id, title,
                            rationale=None, source_text=None):
    return make_candidate(
        project_id,
        discussion_id,
        "DECISION",
        {"title": title, "rationale": rationale, "status": "CONFIRMED"},
        source_text=source_text,
    )


class DevilsAdvocateTests(unittest.TestCase):
    """The devil's advocate drafts challenges from real sources only:
    pending objections targeting the decision, uncaptured concern
    sentences, overturned precedents, and a missing rationale."""

    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.project = Project(name="Advocate test", description="temporary")
        self.db.add(self.project)
        self.db.flush()

        self.discussion = Discussion(
            project_id=self.project.id,
            title="Sprint review",
            content="",
        )
        self.db.add(self.discussion)
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_non_decision_candidate_has_no_challenges(self):
        candidate = make_candidate(
            self.project.id,
            self.discussion.id,
            "COMMITMENT",
            {"owner": "Bob", "description": "ship it", "status": "OPEN"},
        )
        self.db.add(candidate)
        self.db.flush()

        self.assertEqual(draft_challenges(self.db, candidate), [])

    def test_pending_objection_targeting_the_decision_is_challenged(self):
        decision = make_decision_candidate(
            self.project.id, self.discussion.id, "Redis"
        )
        objection = make_candidate(
            self.project.id,
            self.discussion.id,
            "ARGUMENT",
            {
                "stance": "AGAINST",
                "claim": "Redis adds complexity",
                "author": "Bob",
                "target_title": "using Redis",
            },
            source_text="Bob disagrees with using Redis because it is complex",
        )
        # A FOR argument and an objection aimed elsewhere are not challenges.
        support = make_candidate(
            self.project.id,
            self.discussion.id,
            "ARGUMENT",
            {
                "stance": "FOR",
                "claim": "it scales",
                "author": None,
                "target_title": "using Redis",
            },
            source_text="I agree Redis scales",
        )
        elsewhere = make_candidate(
            self.project.id,
            self.discussion.id,
            "ARGUMENT",
            {
                "stance": "AGAINST",
                "claim": "the plan is bad",
                "author": None,
                "target_title": None,
            },
            source_text="I disagree",
        )
        self.db.add_all([decision, objection, support, elsewhere])
        self.db.flush()

        challenges = draft_challenges(self.db, decision)

        kinds = [challenge["kind"] for challenge in challenges]

        self.assertIn("unresolved_objection", kinds)
        self.assertEqual(len(
            [k for k in kinds if k == "unresolved_objection"]
        ), 1)

        challenge = next(
            c for c in challenges if c["kind"] == "unresolved_objection"
        )
        self.assertEqual(challenge["claim"], "Redis adds complexity")
        self.assertEqual(challenge["citation"], f"candidate #{objection.id}")

    def test_uncaptured_concern_sentence_is_challenged(self):
        self.discussion.content = (
            "We decided to use Redis. "
            "A failed migration would cost us a lot though."
        )
        self.db.flush()

        decision = make_decision_candidate(
            self.project.id,
            self.discussion.id,
            "Redis",
            source_text="We decided to use Redis",
        )
        self.db.add(decision)
        self.db.flush()

        challenges = draft_challenges(self.db, decision)

        concerns = [
            c for c in challenges if c["kind"] == "silent_concern"
        ]
        self.assertEqual(len(concerns), 1)
        self.assertEqual(
            concerns[0]["claim"],
            "A failed migration would cost us a lot though",
        )
        self.assertEqual(
            concerns[0]["citation"],
            f"discussion #{self.discussion.id}",
        )

    def test_captured_sentences_are_not_reflagged_as_concerns(self):
        sentence = "A failed migration would cost us a lot though"
        self.discussion.content = f"We decided to use Redis. {sentence}"
        self.db.flush()

        decision = make_decision_candidate(
            self.project.id,
            self.discussion.id,
            "Redis",
            source_text="We decided to use Redis",
        )
        # The concern sentence is already the source of an argument
        # candidate, so it is captured, not silent.
        captured = make_candidate(
            self.project.id,
            self.discussion.id,
            "ARGUMENT",
            {
                "stance": "AGAINST",
                "claim": "the window is too short",
                "author": None,
                "target_title": "using Redis",
            },
            source_text=sentence,
        )
        self.db.add_all([decision, captured])
        self.db.flush()

        challenges = draft_challenges(self.db, decision)

        self.assertEqual(
            [c for c in challenges if c["kind"] == "silent_concern"],
            [],
        )

    def test_chinese_concern_sentence_is_challenged(self):
        self.discussion.content = (
            "我们决定使用 Redis。我们担心迁移窗口太短而且没有回滚方案。"
        )
        self.db.flush()

        decision = make_decision_candidate(
            self.project.id,
            self.discussion.id,
            "Redis",
            source_text="我们决定使用 Redis",
        )
        self.db.add(decision)
        self.db.flush()

        challenges = draft_challenges(self.db, decision)

        concerns = [
            c for c in challenges if c["kind"] == "silent_concern"
        ]
        self.assertEqual(len(concerns), 1)
        self.assertEqual(
            concerns[0]["claim"], "我们担心迁移窗口太短而且没有回滚方案"
        )

    def test_overturned_precedent_is_challenged(self):
        precedent = Decision(
            project_id=self.project.id,
            title="Use PostgreSQL",
            rationale="standard",
            status="CONFIRMED",
        )
        unrelated = Decision(
            project_id=self.project.id,
            title="Rewrite the frontend",
            rationale="legacy",
            status="CONFIRMED",
        )
        self.db.add_all([precedent, unrelated])
        self.db.flush()

        update_decision(
            precedent.id,
            DecisionUpdate(status="SUPERSEDED", reason="did not hold"),
            db=self.db,
        )
        update_decision(
            unrelated.id,
            DecisionUpdate(status="REVOKED", reason="legacy"),
            db=self.db,
        )

        decision = make_decision_candidate(
            self.project.id,
            self.discussion.id,
            "PostgreSQL 16",
            rationale="we need a real database",
        )
        self.db.add(decision)
        self.db.flush()

        challenges = draft_challenges(self.db, decision)

        precedents = [
            c for c in challenges if c["kind"] == "overturned_precedent"
        ]
        self.assertEqual(len(precedents), 1)
        self.assertEqual(
            precedents[0]["citation"], f"decision #{precedent.id}"
        )
        self.assertIn("PostgreSQL", precedents[0]["claim"])

    def test_exact_duplicate_title_is_not_a_precedent(self):
        precedent = Decision(
            project_id=self.project.id,
            title="Use PostgreSQL",
            rationale="standard",
            status="CONFIRMED",
        )
        self.db.add(precedent)
        self.db.flush()

        update_decision(
            precedent.id,
            DecisionUpdate(status="SUPERSEDED", reason="did not hold"),
            db=self.db,
        )

        # Restatements are handled by duplicate_of, not by the advocate.
        decision = make_decision_candidate(
            self.project.id,
            self.discussion.id,
            "Use PostgreSQL",
            rationale="re-stated",
        )
        self.db.add(decision)
        self.db.flush()

        challenges = draft_challenges(self.db, decision)

        self.assertEqual(
            [c for c in challenges if c["kind"] == "overturned_precedent"],
            [],
        )

    def test_missing_rationale_is_challenged(self):
        decision = make_decision_candidate(
            self.project.id, self.discussion.id, "Use Redis", rationale=None
        )
        self.db.add(decision)
        self.db.flush()

        challenges = draft_challenges(self.db, decision)

        self.assertIn(
            "missing_rationale",
            [c["kind"] for c in challenges],
        )

        decision.payload = json.dumps({
            "title": "Use Redis",
            "rationale": "we need caching",
            "status": "CONFIRMED",
        })
        self.db.flush()

        challenges = draft_challenges(self.db, decision)

        self.assertNotIn(
            "missing_rationale",
            [c["kind"] for c in challenges],
        )

    def test_confirm_requires_every_challenge_resolved(self):
        self.discussion.content = (
            "We decided to use Redis. "
            "A failed migration would cost us a lot though."
        )
        self.db.flush()

        decision = make_decision_candidate(
            self.project.id, self.discussion.id, "Use Redis"
        )
        self.db.add(decision)
        self.db.flush()

        with self.assertRaises(Exception) as raised:
            confirm_candidate(
                decision.id,
                CandidateConfirmRequest(
                    challenge_resolutions=[
                        ChallengeResolution(
                            challenge_id="some_stale_id",
                            resolved_reason="handled",
                        )
                    ]
                ),
                db=self.db,
            )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(
            raised.exception.detail["code"], "CHALLENGES_UNRESOLVED"
        )

    def test_confirm_records_resolutions_as_resolved_arguments(self):
        self.discussion.content = (
            "We decided to use Redis. "
            "A failed migration would cost us a lot though."
        )
        self.db.flush()

        decision = make_decision_candidate(
            self.project.id, self.discussion.id, "Use Redis"
        )
        self.db.add(decision)
        self.db.flush()

        drafted = draft_challenges(self.db, decision)

        resolutions = [
            ChallengeResolution(
                challenge_id=challenge["id"],
                resolved_reason="acknowledged",
            )
            for challenge in drafted
        ]

        result = confirm_candidate(
            decision.id,
            CandidateConfirmRequest(challenge_resolutions=resolutions),
            db=self.db,
        )

        self.assertEqual(result["challenges_recorded"], len(drafted))

        self.db.expire_all()
        created = self.db.query(Decision).filter(
            Decision.project_id == self.project.id
        ).first()
        self.assertIsNotNone(created)

        arguments = self.db.query(Argument).filter(
            Argument.decision_id == created.id
        ).all()

        self.assertEqual(len(arguments), len(drafted))
        self.assertTrue(all(
            argument.stance == "AGAINST"
            and argument.status == "RESOLVED"
            and argument.resolved_reason == "acknowledged"
            for argument in arguments
        ))

        candidate = self.db.query(Candidate).filter(
            Candidate.id == decision.id
        ).first()
        self.assertEqual(candidate.status, "CONFIRMED")

    def test_plain_confirm_without_resolutions_still_works(self):
        decision = make_decision_candidate(
            self.project.id, self.discussion.id, "Use Redis"
        )
        self.db.add(decision)
        self.db.flush()

        result = confirm_candidate(decision.id, None, db=self.db)

        self.assertEqual(result["challenges_recorded"], None)

        self.db.expire_all()
        created = self.db.query(Decision).filter(
            Decision.project_id == self.project.id
        ).first()
        self.assertIsNotNone(created)

        arguments = self.db.query(Argument).all()
        self.assertEqual(arguments, [])

    def test_challenges_endpoint_shape(self):
        decision = make_decision_candidate(
            self.project.id, self.discussion.id, "Use Redis"
        )
        self.db.add(decision)
        self.db.flush()

        payload = get_candidate_challenges(decision.id, db=self.db)

        self.assertEqual(payload["candidate_id"], decision.id)
        self.assertEqual(payload["decision_title"], "Use Redis")
        self.assertIn(
            "missing_rationale",
            [c["id"] for c in payload["challenges"]],
        )
        self.assertEqual(payload["total"], len(payload["challenges"]))


class TitleSimilarityTests(unittest.TestCase):
    """The precedent rule only fires on genuinely similar titles."""

    def test_shared_significant_token_is_similar(self):
        self.assertTrue(titles_similar("Use PostgreSQL", "PostgreSQL 16"))

    def test_exact_match_is_not_similar_it_is_a_duplicate(self):
        self.assertFalse(titles_similar("Use Redis", "using Redis"))

    def test_shared_short_token_is_not_similar(self):
        self.assertFalse(titles_similar("use the new API", "the API docs"))

    def test_shared_cjk_substring_is_similar(self):
        self.assertTrue(titles_similar("采用微服务架构", "停止微服务架构"))

    def test_unrelated_titles_are_not_similar(self):
        self.assertFalse(titles_similar("Use Redis", "Rewrite the frontend"))


if __name__ == "__main__":
    unittest.main()
