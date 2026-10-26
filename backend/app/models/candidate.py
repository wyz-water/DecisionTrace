from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Text, ForeignKey

from app.database import Base, UTCDateTime


class Candidate(Base):
    """An AI-extracted record awaiting human review.

    Candidates are never authoritative project records. They must be
    confirmed by a human before they become a real Decision,
    Commitment, or Dependency.
    """

    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)

    project_id = Column(
        Integer,
        ForeignKey("projects.id"),
        nullable=False
    )

    discussion_id = Column(
        Integer,
        ForeignKey("discussions.id"),
        nullable=False
    )

    candidate_type = Column(
        String(20),
        nullable=False
    )

    payload = Column(
        Text,
        nullable=False
    )

    source_text = Column(
        Text,
        nullable=True
    )

    status = Column(
        String(20),
        nullable=False,
        default="PENDING"
    )

    review_comment = Column(
        Text,
        nullable=True
    )

    created_at = Column(
        UTCDateTime(),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
