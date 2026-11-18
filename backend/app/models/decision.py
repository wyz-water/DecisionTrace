from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Text, ForeignKey
from app.database import Base, UTCDateTime


class Decision(Base):
    __tablename__ = "decisions"

    id = Column(Integer, primary_key=True, index=True)

    project_id = Column(
        Integer,
        ForeignKey("projects.id"),
        nullable=False
    )

    source_discussion_id = Column(
        Integer,
        ForeignKey("discussions.id"),
        nullable=True
    )

    title = Column(
        String(200),
        nullable=False
    )

    rationale = Column(
        Text,
        nullable=True
    )

    # Who made the decision. Null means a team decision ("we decided"):
    # the extractor never invents a single maker for a collective verb.
    # Distinct from commitment.owner — that is who does the work, this
    # is who decided it.
    decided_by = Column(
        String(80),
        nullable=True
    )

    status = Column(
        String(50),
        nullable=False,
        default="CONFIRMED"
    )

    # The decision that replaced this one, when this one was SUPERSEDED.
    # Reversal is a first-class relationship (not just a status): the
    # reversal trace can then name the successor instead of guessing.
    superseded_by_decision_id = Column(
        Integer,
        ForeignKey("decisions.id"),
        nullable=True
    )

    # The decision chain this decision is a node of (null until the
    # chain exists). A chain groups the versions of one subject — the
    # initial decision and its follow-ups; a reversal is just the next
    # node of the same chain.
    chain_id = Column(
        Integer,
        ForeignKey("chains.id"),
        nullable=True
    )

    # When the decision was recorded. Feeds the retrospective metrics
    # (lifespan of overturned decisions) and future staleness checks.
    created_at = Column(
        UTCDateTime(),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )