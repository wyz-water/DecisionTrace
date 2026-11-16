import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.argument import Argument
from app.models.commitment import Commitment
from app.models.commitment_history import CommitmentHistory
from app.models.decision import Decision
from app.models.project import Project
from app.routes.decisions import get_decision_reversal, update_decision
from app.schemas.decision import DecisionUpdate


def make_decision(project_id, title, status="CONFIRMED"):
    return Decision(
        project_id=project_id,
        title=title,
        rationale="because",
        status=status,
    )


class ReversalTests(unittest.TestCase):
    """The reversal trace explains why an overturned decision did not
    hold, assembled from the flip, the successor, the objections and the
    slipped commitments — each signal citing the row it came from."""

    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.project = Project(name="Reversal test", description="temporary")
        self.db.add(self.project)
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_confirmed_decision_is_not_reversed(self):
        decision = make_decision(self.project.id, "Use Redis")
        self.db.add(decision)
        self.db.flush()

        payload = get_decision_reversal(decision.id, db=self.db)

        self.assertFalse(payload["reversed"])
        self.assertEqual(payload["signals"], [])
        self.assertIsNone(payload["superseded_by"])

    def test_reversal_narrative_assembles_every_signal(self):
        decision = make_decision(self.project.id, "Use Redis")
        successor = make_decision(self.project.id, "Use Memcached")
        self.db.add_all([decision, successor])
        self.db.flush()

        objection = Argument(
            project_id=self.project.id,
            decision_id=decision.id,
            stance="AGAINST",
            claim="Redis adds complexity",
            author="Bob",
            source_text="Bob disagrees with using Redis",
            status="OPEN",
        )
        commitment = Commitment(
            project_id=self.project.id,
            decision_id=decision.id,
            owner="Carol",
            description="Migrate the cache",
            status="DELAYED",
        )
        self.db.add_all([objection, commitment])
        self.db.flush()

        self.db.add(CommitmentHistory(
            commitment_id=commitment.id,
            old_status="OPEN",
            new_status="DELAYED",
            reason="waiting on the storage team",
        ))
        self.db.flush()

        update_decision(
            decision.id,
            DecisionUpdate(
                status="SUPERSEDED",
                reason="cache latency did not improve",
                superseded_by_decision_id=successor.id,
            ),
            db=self.db,
        )

        self.db.expire_all()
        payload = get_decision_reversal(decision.id, db=self.db)

        self.assertTrue(payload["reversed"])
        self.assertEqual(payload["reason"], "cache latency did not improve")
        self.assertIsNotNone(payload["reversed_at"])
        self.assertGreaterEqual(payload["lifespan_days"], 0)
        self.assertEqual(payload["superseded_by"].id, successor.id)

        types = [signal["type"] for signal in payload["signals"]]
        self.assertEqual(
            types,
            ["reversal", "successor", "objection", "slip"],
        )

        by_type = {signal["type"]: signal for signal in payload["signals"]}

        self.assertIn("cache latency", by_type["reversal"]["summary"])
        self.assertIn("history #", by_type["reversal"]["citation"])

        self.assertIn("Memcached", by_type["successor"]["summary"])
        self.assertEqual(by_type["successor"]["citation"], "because")

        self.assertIn("Redis adds complexity", by_type["objection"]["summary"])
        self.assertEqual(
            by_type["objection"]["source_text"],
            "Bob disagrees with using Redis",
        )
        self.assertIn("argument #", by_type["objection"]["citation"])

        self.assertIn("Migrate the cache", by_type["slip"]["summary"])
        self.assertIn("delayed", by_type["slip"]["summary"])
        self.assertIsNotNone(by_type["slip"]["at"])
        self.assertIn("commitment #", by_type["slip"]["citation"])

    def test_superseded_by_self_is_rejected(self):
        decision = make_decision(self.project.id, "Use Redis")
        self.db.add(decision)
        self.db.flush()

        with self.assertRaises(Exception) as raised:
            update_decision(
                decision.id,
                DecisionUpdate(
                    status="SUPERSEDED",
                    superseded_by_decision_id=decision.id,
                ),
                db=self.db,
            )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(
            str(raised.exception.detail),
            "A decision cannot supersede itself",
        )

    def test_superseded_by_unknown_decision_is_404(self):
        decision = make_decision(self.project.id, "Use Redis")
        self.db.add(decision)
        self.db.flush()

        with self.assertRaises(Exception) as raised:
            update_decision(
                decision.id,
                DecisionUpdate(
                    status="SUPERSEDED",
                    superseded_by_decision_id=9999,
                ),
                db=self.db,
            )

        self.assertEqual(raised.exception.status_code, 404)

    def test_superseded_by_cross_project_is_rejected(self):
        other_project = Project(name="Other", description="temporary")
        self.db.add(other_project)
        self.db.flush()

        decision = make_decision(self.project.id, "Use Redis")
        other = make_decision(other_project.id, "Use Memcached")
        self.db.add_all([decision, other])
        self.db.flush()

        with self.assertRaises(Exception) as raised:
            update_decision(
                decision.id,
                DecisionUpdate(
                    status="SUPERSEDED",
                    superseded_by_decision_id=other.id,
                ),
                db=self.db,
            )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(
            str(raised.exception.detail),
            "The superseding decision must be in the same project",
        )

    def test_superseded_by_overturned_decision_is_rejected(self):
        decision = make_decision(self.project.id, "Use Redis")
        dead = make_decision(self.project.id, "Use Memcached")
        self.db.add_all([decision, dead])
        self.db.flush()

        update_decision(
            dead.id,
            DecisionUpdate(status="REVOKED", reason="never happened"),
            db=self.db,
        )

        with self.assertRaises(Exception) as raised:
            update_decision(
                decision.id,
                DecisionUpdate(
                    status="SUPERSEDED",
                    superseded_by_decision_id=dead.id,
                ),
                db=self.db,
            )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(
            str(raised.exception.detail),
            "The superseding decision must be CONFIRMED",
        )

    def test_title_only_edit_keeps_the_successor_link(self):
        decision = make_decision(self.project.id, "Use Redis")
        successor = make_decision(self.project.id, "Use Memcached")
        self.db.add_all([decision, successor])
        self.db.flush()

        update_decision(
            decision.id,
            DecisionUpdate(
                status="SUPERSEDED",
                superseded_by_decision_id=successor.id,
            ),
            db=self.db,
        )

        update_decision(
            decision.id,
            DecisionUpdate(title="Use Redis 7"),
            db=self.db,
        )

        self.db.expire_all()
        refreshed = self.db.query(Decision).filter(
            Decision.id == decision.id
        ).first()
        self.assertEqual(refreshed.status, "SUPERSEDED")
        self.assertEqual(
            refreshed.superseded_by_decision_id, successor.id
        )

    def test_resurrecting_a_decision_clears_the_link(self):
        decision = make_decision(self.project.id, "Use Redis")
        successor = make_decision(self.project.id, "Use Memcached")
        self.db.add_all([decision, successor])
        self.db.flush()

        update_decision(
            decision.id,
            DecisionUpdate(
                status="SUPERSEDED",
                superseded_by_decision_id=successor.id,
            ),
            db=self.db,
        )

        update_decision(
            decision.id,
            DecisionUpdate(status="CONFIRMED", reason="reinstated"),
            db=self.db,
        )

        self.db.expire_all()
        refreshed = self.db.query(Decision).filter(
            Decision.id == decision.id
        ).first()
        self.assertEqual(refreshed.status, "CONFIRMED")
        self.assertIsNone(refreshed.superseded_by_decision_id)


if __name__ == "__main__":
    unittest.main()
