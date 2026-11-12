from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Text, ForeignKey

from app.database import Base, UTCDateTime


class Argument(Base):
    """A point made during the deliberation of a decision.

    The deliberation layer: pros and cons are first-class records so a
    decision keeps the reasoning behind it, not just its conclusion.
    Arguments pass through the same candidate gate (A2) as every other
    record and stay anchored to the sentence they came from.
    """

    __tablename__ = "arguments"

    id = Column(Integer, primary_key=True, index=True)

    project_id = Column(
        Integer,
        ForeignKey("projects.id"),
        nullable=False
    )

    discussion_id = Column(
        Integer,
        ForeignKey("discussions.id"),
        nullable=True
    )

    # The decision the argument targets; null when the extraction could
    # not link it (a free-standing concern).
    decision_id = Column(
        Integer,
        ForeignKey("decisions.id"),
        nullable=True
    )

    stance = Column(
        String(10),
        nullable=False
    )

    claim = Column(
        Text,
        nullable=False
    )

    author = Column(
        String(80),
        nullable=True
    )

    source_text = Column(
        Text,
        nullable=True
    )

    status = Column(
        String(20),
        nullable=False,
        default="OPEN"
    )

    resolved_reason = Column(
        Text,
        nullable=True
    )

    created_at = Column(
        UTCDateTime(),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
