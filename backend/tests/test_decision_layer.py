import json
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.argument import Argument
from app.models.candidate import Candidate
from app.models.commitment import Commitment
from app.models.decision import Decision
from app.models.decision_dependency import DecisionDependency
from app.models.dependency import Dependency
from app.models.discussion import Discussion
from app.models.project import Project
from app.routes.candidates import _confirm_pending, confirm_candidate
from app.routes.decisions import (
    create_decision,
    delete_decision_dependency,
    get_decision_dependencies,
    get_decision_reversal,
    update_decision,
)
from app.routes.projects import get_project_stakeholder
from app.schemas.candidate import CandidateConfirmRequest
from app.schemas.decision import DecisionCreate, DecisionUpdate
from app.services.extractor import rule_based_extract


def make_decision(project_id, title, decided_by=None, status="CONFIRMED"):
    return Decision(
        project_id=project_id,
        title=title,
        rationale="because",
        decided_by=decided_by,
        status=status,
    )


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


class DecisionMakerExtractionTests(unittest.TestCase):
    def test_named_maker_is_captured(self):
        candidates = rule_based_extract(
            "Alice decided to use Redis because it scales well."
        )

        decision = next(
            c for c in candidates if c["candidate_type"] == "DECISION"
        )

        self.assertEqual(decision["payload"]["decided_by"], "Alice")
        self.assertEqual(decision["payload"]["title"], "Redis")

    def test_collective_decision_stays_team(self):
        candidates = rule_based_extract(
            "We decided to use Redis because it scales well."
        )

        decision = next(
            c for c in candidates if c["candidate_type"] == "DECISION"
        )

        self.assertIsNone(decision["payload"]["decided_by"])

    def test_chinese_named_maker_is_captured(self):
        candidates = rule_based_extract("王芳决定采用 Redis。")

        decision = next(
            c for c in candidates if c["candidate_type"] == "DECISION"
        )

        self.assertEqual(decision["payload"]["decided_by"], "王芳")
        self.assertEqual(decision["payload"]["title"], "Redis")

    def test_chinese_collective_stays_team_and_keeps_verb(self):
        candidates = rule_based_extract("我们决定迁移到云。")

        decision = next(
            c for c in candidates if c["candidate_type"] == "DECISION"
        )

        self.assertIsNone(decision["payload"]["decided_by"])
        self.assertEqual(decision["payload"]["title"], "迁移到云")


class DecisionDependencyExtractionTests(unittest.TestCase):
    def test_compound_sentence_emits_decision_and_edge(self):
        candidates = rule_based_extract(
            "We decided to use Redis because it scales well, after we "
            "had decided to migrate to the cloud."
        )

        decisions = [
            c for c in candidates if c["candidate_type"] == "DECISION"
        ]
        edges = [
            c for c in candidates
            if c["candidate_type"] == "DECISION_DEPENDENCY"
        ]

        self.assertEqual(len(decisions), 1)
        self.assertEqual(decisions[0]["payload"]["title"], "Redis")
        self.assertEqual(decisions[0]["payload"]["rationale"], "it scales well")

        self.assertEqual(len(edges), 1)
        self.assertEqual(edges[0]["payload"]["predecessor_title"], "migrate to the cloud")
        self.assertEqual(edges[0]["payload"]["successor_title"], "Redis")

    def test_building_on_pattern(self):
        candidates = rule_based_extract(
            "Building on our decision to migrate to the cloud, we "
            "decided to use Redis."
        )

        edges = [
            c for c in candidates
            if c["candidate_type"] == "DECISION_DEPENDENCY"
        ]

        self.assertEqual(len(edges), 1)
        self.assertEqual(edges[0]["payload"]["predecessor_title"], "migrate to the cloud")
        self.assertEqual(edges[0]["payload"]["successor_title"], "Redis")

    def test_proximity_linking_uses_the_compound_decision(self):
        candidates = rule_based_extract(
            "We decided to use Redis after we had decided to migrate "
            "to the cloud. Dora will set up the cache by 2026-12-15."
        )

        commitment = next(
            c for c in candidates if c["candidate_type"] == "COMMITMENT"
        )

        self.assertEqual(commitment["payload"]["decision_title"], "Redis")


class DecisionDependencyGateTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.project = Project(name="Layer test", description="temporary")
        self.db.add(self.project)
        self.db.flush()

        self.discussion = Discussion(
            project_id=self.project.id,
            title="sync",
            content="",
        )
        self.db.add(self.discussion)
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def add_decision(self, title):
        decision = make_decision(self.project.id, title)
        self.db.add(decision)
        self.db.flush()
        return decision

    def add_edge_candidate(self, predecessor_title, successor_title):
        candidate = make_candidate(
            self.project.id,
            self.discussion.id,
            "DECISION_DEPENDENCY",
            {
                "predecessor_title": predecessor_title,
                "successor_title": successor_title,
                "dependency_type": "DEPENDS_ON",
            },
            source_text="edge",
        )
        self.db.add(candidate)
        self.db.flush()
        return candidate

    def test_confirm_creates_the_edge(self):
        predecessor = self.add_decision("migrate to the cloud")
        successor = self.add_decision("use Redis")
        candidate = self.add_edge_candidate(
            "migrate to the cloud", "using Redis"
        )

        result = _confirm_pending(self.db, candidate.id)

        edge = self.db.query(DecisionDependency).first()

        self.assertIsNotNone(edge)
        self.assertEqual(edge.predecessor_decision_id, predecessor.id)
        self.assertEqual(edge.successor_decision_id, successor.id)
        self.assertEqual(result["created_id"], edge.id)

    def test_missing_predecessor_is_rejected(self):
        self.add_decision("use Redis")
        candidate = self.add_edge_candidate(
            "migrate to the cloud", "use Redis"
        )

        with self.assertRaises(HTTPException) as raised:
            _confirm_pending(self.db, candidate.id)

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("migrate to the cloud", str(raised.exception.detail))

    def test_self_dependency_is_rejected(self):
        self.add_decision("use Redis")
        candidate = self.add_edge_candidate("use Redis", "using Redis")

        with self.assertRaises(HTTPException) as raised:
            _confirm_pending(self.db, candidate.id)

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("itself", str(raised.exception.detail))

    def test_duplicate_edge_is_rejected(self):
        first = self.add_decision("migrate to the cloud")
        second = self.add_decision("use Redis")
        self.db.add(DecisionDependency(
            project_id=self.project.id,
            predecessor_decision_id=first.id,
            successor_decision_id=second.id,
            dependency_type="DEPENDS_ON",
        ))
        self.db.flush()

        candidate = self.add_edge_candidate(
            "migrate to the cloud", "use Redis"
        )

        with self.assertRaises(HTTPException) as raised:
            _confirm_pending(self.db, candidate.id)

        self.assertEqual(raised.exception.status_code, 409)

    def test_cycle_is_rejected(self):
        first = self.add_decision("migrate to the cloud")
        second = self.add_decision("use Redis")
        self.db.add(DecisionDependency(
            project_id=self.project.id,
            predecessor_decision_id=first.id,
            successor_decision_id=second.id,
            dependency_type="DEPENDS_ON",
        ))
        self.db.flush()

        # second -> first would close the loop
        candidate = self.add_edge_candidate("use Redis", "migrate to the cloud")

        with self.assertRaises(HTTPException) as raised:
            _confirm_pending(self.db, candidate.id)

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.detail["code"], "DECISION_CYCLE")


class DecisionDependenciesRouteTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.project = Project(name="Route test", description="temporary")
        self.db.add(self.project)
        self.db.flush()

        self.base = make_decision(self.project.id, "migrate to the cloud")
        self.resting = make_decision(self.project.id, "use Redis")
        self.other = make_decision(self.project.id, "keep PostgreSQL")
        self.db.add_all([self.base, self.resting, self.other])
        self.db.flush()

        self.db.add(DecisionDependency(
            project_id=self.project.id,
            predecessor_decision_id=self.base.id,
            successor_decision_id=self.resting.id,
            dependency_type="DEPENDS_ON",
        ))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_dependencies_endpoint_reports_both_directions(self):
        payload = get_decision_dependencies(self.resting.id, db=self.db)

        self.assertEqual(
            [row.id for row in payload["upstream"]], [self.base.id]
        )
        self.assertEqual(payload["downstream"], [])

        payload = get_decision_dependencies(self.base.id, db=self.db)

        self.assertEqual(
            [row.id for row in payload["downstream"]], [self.resting.id]
        )

    def test_delete_edge(self):
        edge = self.db.query(DecisionDependency).first()

        result = delete_decision_dependency(edge.id, db=self.db)

        self.assertEqual(result, {"deleted": edge.id})
        self.assertEqual(self.db.query(DecisionDependency).count(), 0)

    def test_reversal_names_the_resting_decision(self):
        update_decision(
            self.base.id,
            DecisionUpdate(status="SUPERSEDED", reason="too risky"),
            db=self.db,
        )

        payload = get_decision_reversal(self.base.id, db=self.db)

        risk_signals = [
            signal
            for signal in payload["signals"]
            if signal["type"] == "decision_risk"
        ]

        self.assertEqual(len(risk_signals), 1)
        self.assertIn("use Redis", risk_signals[0]["summary"])
        self.assertEqual(payload["superseded_by"], None)


class DecidedByTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.project = Project(name="Maker test", description="temporary")
        self.db.add(self.project)
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_create_with_maker(self):
        decision = create_decision(
            DecisionCreate(
                project_id=self.project.id,
                title="use Redis",
                rationale="because",
                decided_by="Alice",
            ),
            db=self.db,
        )

        self.assertEqual(decision.decided_by, "Alice")

    def test_patch_sets_and_clears_the_maker(self):
        decision = create_decision(
            DecisionCreate(
                project_id=self.project.id,
                title="use Redis",
                rationale="because",
            ),
            db=self.db,
        )

        update_decision(
            decision.id,
            DecisionUpdate(decided_by="Alice"),
            db=self.db,
        )

        self.db.expire_all()
        updated = self.db.query(Decision).filter(
            Decision.id == decision.id
        ).first()
        self.assertEqual(updated.decided_by, "Alice")

        update_decision(
            decision.id,
            DecisionUpdate(decided_by=""),
            db=self.db,
        )

        self.db.expire_all()
        cleared = self.db.query(Decision).filter(
            Decision.id == decision.id
        ).first()
        self.assertIsNone(cleared.decided_by)


class StakeholderTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.project = Project(name="Stake test", description="temporary")
        self.db.add(self.project)
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_stakeholder_view_aggregates_the_person(self):
        alice_decision = make_decision(
            self.project.id, "migrate to the cloud", decided_by="Alice"
        )
        team_decision = make_decision(self.project.id, "use Redis")
        self.db.add_all([alice_decision, team_decision])
        self.db.flush()

        alice_commitment = Commitment(
            project_id=self.project.id,
            decision_id=team_decision.id,
            owner="Alice",
            description="run the migration",
            status="OPEN",
        )
        bob_commitment = Commitment(
            project_id=self.project.id,
            owner="Bob",
            description="write the runbook",
            status="OPEN",
        )
        self.db.add_all([alice_commitment, bob_commitment])
        self.db.flush()

        self.db.add(Dependency(
            project_id=self.project.id,
            predecessor_commitment_id=alice_commitment.id,
            successor_commitment_id=bob_commitment.id,
            dependency_type="BLOCKS",
        ))
        self.db.add(DecisionDependency(
            project_id=self.project.id,
            predecessor_decision_id=alice_decision.id,
            successor_decision_id=team_decision.id,
            dependency_type="DEPENDS_ON",
        ))
        self.db.commit()

        payload = get_project_stakeholder(
            self.project.id, "Alice", db=self.db
        )

        self.assertEqual(
            [row.id for row in payload["decisions_made"]],
            [alice_decision.id],
        )
        self.assertEqual(
            [row.id for row in payload["decisions_affecting_me"]],
            [team_decision.id],
        )
        self.assertEqual(len(payload["commitments"]), 1)
        self.assertEqual(payload["commitments"][0].state, "READY")

        self.assertEqual(len(payload["waiting_on_me"]), 1)
        self.assertEqual(payload["waiting_on_me"][0].owner, "Bob")

        self.assertEqual(
            [row.id for row in payload["decisions_resting_on_mine"]],
            [team_decision.id],
        )

    def test_stakeholder_with_no_records_is_empty_not_error(self):
        payload = get_project_stakeholder(
            self.project.id, "Nobody", db=self.db
        )

        self.assertEqual(payload["decisions_made"], [])
        self.assertEqual(payload["commitments"], [])


if __name__ == "__main__":
    unittest.main()
