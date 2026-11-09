import json
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.candidate import Candidate
from app.models.decision import Decision
from app.models.discussion import Discussion
from app.models.project import Project
from app.routes.candidates import (
    confirm_candidates_batch,
    extract_from_discussion,
)
from app.routes.decisions import create_decision
from app.schemas.candidate import CandidateBatchConfirmRequest
from app.schemas.decision import DecisionCreate


class FeedbackAutomationTests(unittest.TestCase):
    """Tests for the presentation-feedback changes: decision goals are
    required on manual creation, extraction returns a summary, duplicates
    are flagged, and candidates can be confirmed in batches."""

    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.project = Project(name="Feedback test", description="temporary")
        self.db.add(self.project)
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

    def add_candidate(self, ctype, payload, discussion=None):
        if discussion is None:
            discussion = self.add_discussion("placeholder")
        candidate = Candidate(
            project_id=self.project.id,
            discussion_id=discussion.id,
            candidate_type=ctype,
            payload=json.dumps(payload),
            source_text="test sentence",
            status="PENDING",
        )
        self.db.add(candidate)
        self.db.flush()
        return candidate

    # ---- Feedback point 0: a decision must record its goal -----------

    def test_decision_without_rationale_is_rejected(self):
        with self.assertRaises(HTTPException) as raised:
            create_decision(
                DecisionCreate(
                    project_id=self.project.id,
                    title="Use Redis",
                ),
                db=self.db,
            )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("Rationale is required", raised.exception.detail)

    def test_decision_with_rationale_is_created(self):
        created = create_decision(
            DecisionCreate(
                project_id=self.project.id,
                title="Use Redis",
                rationale="Caching layer for hot paths",
            ),
            db=self.db,
        )

        self.assertEqual(created.title, "Use Redis")
        self.assertEqual(created.rationale, "Caching layer for hot paths")

    def test_candidate_confirm_still_allows_missing_rationale(self):
        # The extracted path keeps rationale optional: the source
        # discussion is the goal context for meeting-derived decisions.
        candidate = self.add_candidate("DECISION", {
            "title": "Extracted decision",
            "rationale": None,
            "status": "CONFIRMED",
        })

        result = confirm_candidates_batch(
            CandidateBatchConfirmRequest(candidate_ids=[candidate.id]),
            db=self.db,
        )

        self.assertEqual(len(result["confirmed"]), 1)
        self.assertEqual(result["skipped_duplicates"], [])

    # ---- Feedback point 1: summary + duplicate detection ------------

    def test_extract_returns_rule_based_summary(self):
        discussion = self.add_discussion(
            "We decided to use PostgreSQL because it handles JSON well. "
            "Carol will complete the database schema by Oct 16."
        )

        result = extract_from_discussion(discussion.id, db=self.db)

        self.assertEqual(result["summary"]["total"], 2)
        self.assertEqual(result["summary"]["decisions"], ["PostgreSQL"])
        self.assertEqual(result["summary"]["commitments"], ["Carol"])

    def test_duplicate_decision_candidate_is_flagged(self):
        self.db.add(Decision(
            project_id=self.project.id,
            title="PostgreSQL",
            rationale="JSON support",
            status="CONFIRMED",
        ))
        self.db.commit()

        discussion = self.add_discussion(
            "We decided to use PostgreSQL because it handles JSON well."
        )
        result = extract_from_discussion(discussion.id, db=self.db)

        self.assertEqual(result["created"], 1)
        self.assertEqual(result["candidates"][0]["duplicate_of"], "Decision #1")

    def test_duplicate_commitment_candidate_is_flagged(self):
        from app.models.commitment import Commitment
        self.db.add(Commitment(
            project_id=self.project.id,
            owner="Carol",
            description="Complete the database schema",
            status="OPEN",
        ))
        self.db.commit()

        discussion = self.add_discussion(
            "Carol will complete the database schema by Oct 16."
        )
        result = extract_from_discussion(discussion.id, db=self.db)

        self.assertEqual(result["created"], 1)
        self.assertEqual(
            result["candidates"][0]["duplicate_of"],
            "Commitment #1",
        )

    # ---- Feedback point 1: batch confirmation ------------------------

    def test_batch_confirm_confirms_new_and_skips_duplicates(self):
        self.db.add(Decision(
            project_id=self.project.id,
            title="PostgreSQL",
            rationale="JSON support",
            status="CONFIRMED",
        ))
        self.db.commit()

        fresh = self.add_candidate("DECISION", {
            "title": "Use Redis",
            "rationale": "Cache layer",
            "status": "CONFIRMED",
        })
        duplicate = self.add_candidate("DECISION", {
            "title": "PostgreSQL",
            "rationale": "JSON support",
            "status": "CONFIRMED",
        })
        already = self.add_candidate("DECISION", {
            "title": "Already reviewed",
            "rationale": "test",
            "status": "CONFIRMED",
        })
        already.status = "REJECTED"
        self.db.commit()

        result = confirm_candidates_batch(
            CandidateBatchConfirmRequest(
                candidate_ids=[fresh.id, duplicate.id, already.id, 9999]
            ),
            db=self.db,
        )

        confirmed_ids = [item["candidate_id"] for item in result["confirmed"]]
        self.assertEqual(confirmed_ids, [fresh.id])
        self.assertEqual(result["skipped_duplicates"], [duplicate.id])

        failed = {item["candidate_id"]: item["detail"] for item in result["failed"]}
        self.assertIn(already.id, failed)
        self.assertEqual(failed[9999], "Candidate not found")

        titles = {row.title for row in self.db.query(Decision).all()}
        self.assertIn("Use Redis", titles)
        self.assertNotIn("Already reviewed", titles)


if __name__ == "__main__":
    unittest.main()
