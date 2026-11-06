import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.candidate import Candidate  # noqa: F401 - registers table
from app.models.commitment import Commitment
from app.models.commitment_history import CommitmentHistory
from app.models.decision import Decision  # noqa: F401 - registers table
from app.models.decision_history import DecisionHistory  # noqa: F401
from app.models.dependency import Dependency
from app.models.discussion import Discussion  # noqa: F401 - registers table
from app.models.project import Project
from app.models.snapshot import Snapshot  # noqa: F401 - registers table
from app.routes.commitments import get_commitment_what_if


class CommitmentWhatIfRouteTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        project = Project(name="What-if test", description="temporary")
        self.db.add(project)
        self.db.flush()

        self.source = Commitment(
            project_id=project.id,
            owner="Carol",
            description="Schema",
            status="OPEN",
        )
        middle = Commitment(
            project_id=project.id,
            owner="Bob",
            description="API",
            status="OPEN",
        )
        leaf = Commitment(
            project_id=project.id,
            owner="Alice",
            description="Runbook",
            status="OPEN",
        )
        self.db.add_all([self.source, middle, leaf])
        self.db.flush()

        self.db.add_all([
            Dependency(
                project_id=project.id,
                predecessor_commitment_id=self.source.id,
                successor_commitment_id=middle.id,
                dependency_type="BLOCKS",
            ),
            Dependency(
                project_id=project.id,
                predecessor_commitment_id=middle.id,
                successor_commitment_id=leaf.id,
                dependency_type="BLOCKS",
            ),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def snapshot_rows(self):
        statuses = {
            row.id: row.status
            for row in self.db.query(Commitment).all()
        }
        histories = self.db.query(CommitmentHistory).count()
        return statuses, histories

    def test_what_if_returns_preview_without_writing(self):
        before = self.snapshot_rows()

        result = get_commitment_what_if(
            self.source.id,
            "DELAYED",
            db=self.db,
        )

        after = self.snapshot_rows()

        self.assertTrue(result["preview"])
        self.assertEqual(result["current_status"], "OPEN")
        self.assertEqual(result["hypothetical_status"], "DELAYED")
        self.assertEqual(result["current_total"], 0)
        self.assertEqual(result["total"], 2)
        self.assertEqual(len(result["newly_affected"]), 2)
        self.assertEqual(result["already_affected"], [])
        self.assertEqual(before, after)

    def test_invalid_hypothetical_status_is_rejected(self):
        before = self.snapshot_rows()

        with self.assertRaises(HTTPException) as raised:
            get_commitment_what_if(
                self.source.id,
                "COMPLETED",
                db=self.db,
            )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(before, self.snapshot_rows())

    def test_missing_commitment_returns_404(self):
        with self.assertRaises(HTTPException) as raised:
            get_commitment_what_if(9999, "DELAYED", db=self.db)

        self.assertEqual(raised.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
