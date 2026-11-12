import json
import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.argument import Argument
from app.models.decision import Decision
from app.models.project import Project
from app.routes.projects import get_project_health
from app.routes.decisions import update_decision
from app.routes.arguments import resolve_argument
from app.schemas.argument import ArgumentResolve
from app.schemas.decision import DecisionUpdate
from app.services.retrospective import build_health_payload


def make_decision(project_id, title, status="CONFIRMED"):
    return Decision(
        project_id=project_id,
        title=title,
        rationale="because",
        status=status,
    )


class RetrospectiveTests(unittest.TestCase):
    """Decision health metrics are computed from history + arguments:
    overturn rate, lifespan of overturned decisions, revision rate,
    contested rate and objection resolution rate."""

    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.project = Project(name="Health test", description="temporary")
        self.db.add(self.project)
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_empty_project_has_zero_totals_and_no_rates(self):
        health = get_project_health(self.project.id, db=self.db)

        self.assertEqual(health["decisions_total"], 0)
        self.assertIsNone(health["overturn_rate"])
        self.assertIsNone(health["avg_overturn_lifespan_days"])
        self.assertIsNone(health["objection_resolution_rate"])

    def test_overturn_and_revision_rates(self):
        decisions = [
            make_decision(self.project.id, "A"),
            make_decision(self.project.id, "B"),
            make_decision(self.project.id, "C"),
            make_decision(self.project.id, "D"),
        ]
        self.db.add_all(decisions)
        self.db.flush()

        update_decision(
            decisions[0].id,
            DecisionUpdate(status="SUPERSEDED", reason="did not hold"),
            db=self.db,
        )

        health = get_project_health(self.project.id, db=self.db)

        self.assertEqual(health["decisions_total"], 4)
        self.assertEqual(health["overturned_count"], 1)
        self.assertEqual(health["overturn_rate"], 0.25)
        self.assertEqual(health["revised_count"], 1)
        self.assertEqual(health["revision_rate"], 0.25)
        self.assertIsNotNone(health["avg_overturn_lifespan_days"])
        self.assertGreaterEqual(health["avg_overturn_lifespan_days"], 0)

    def test_contested_and_resolution_rates(self):
        first = make_decision(self.project.id, "A")
        second = make_decision(self.project.id, "B")
        self.db.add_all([first, second])
        self.db.flush()

        objection = Argument(
            project_id=self.project.id,
            decision_id=first.id,
            stance="AGAINST",
            claim="too risky",
            status="OPEN",
        )
        self.db.add(objection)
        self.db.flush()

        health = get_project_health(self.project.id, db=self.db)

        self.assertEqual(health["contested_count"], 1)
        self.assertEqual(health["contested_rate"], 0.5)
        self.assertEqual(health["open_objections"], 1)
        self.assertEqual(health["resolved_objections"], 0)
        self.assertEqual(health["objection_resolution_rate"], 0.0)

        resolve_argument(
            objection.id,
            ArgumentResolve(
                status="RESOLVED",
                resolved_reason="we mitigated the risk",
            ),
            db=self.db,
        )

        health = get_project_health(self.project.id, db=self.db)

        self.assertEqual(health["contested_count"], 0)
        self.assertEqual(health["open_objections"], 0)
        self.assertEqual(health["resolved_objections"], 1)
        self.assertEqual(health["objection_resolution_rate"], 1.0)

    def test_payload_builder_counts_decision_once_even_with_two_objections(self):
        decision = make_decision(self.project.id, "A")
        self.db.add(decision)
        self.db.flush()

        arguments = [
            Argument(
                project_id=self.project.id,
                decision_id=decision.id,
                stance="AGAINST",
                claim="first",
                status="OPEN",
            ),
            Argument(
                project_id=self.project.id,
                decision_id=decision.id,
                stance="AGAINST",
                claim="second",
                status="OPEN",
            ),
            Argument(
                project_id=self.project.id,
                decision_id=None,
                stance="AGAINST",
                claim="free-standing",
                status="OPEN",
            ),
        ]

        payload = build_health_payload([decision], [], arguments)

        self.assertEqual(payload["contested_count"], 1)
        self.assertEqual(payload["open_objections"], 3)

    def test_updated_payload_round_trip(self):
        # The route response is the pure payload plus the project id.
        decision = make_decision(self.project.id, "A")
        self.db.add(decision)
        self.db.flush()

        health = get_project_health(self.project.id, db=self.db)

        self.assertEqual(health["project_id"], self.project.id)
        self.assertEqual(health["decisions_total"], 1)


if __name__ == "__main__":
    unittest.main()
