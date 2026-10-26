from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Text, ForeignKey

from app.database import Base, UTCDateTime


class DecisionHistory(Base):
    """One row per decision change, capturing every field before and
    after the change."""

    __tablename__ = "decision_history"

    id = Column(Integer, primary_key=True, index=True)

    decision_id = Column(
        Integer,
        ForeignKey("decisions.id"),
        nullable=False
    )

    old_title = Column(
        String(200),
        nullable=False
    )

    new_title = Column(
        String(200),
        nullable=False
    )

    old_rationale = Column(
        Text,
        nullable=True
    )

    new_rationale = Column(
        Text,
        nullable=True
    )

    old_status = Column(
        String(50),
        nullable=False
    )

    new_status = Column(
        String(50),
        nullable=False
    )

    reason = Column(
        Text,
        nullable=True
    )

    changed_at = Column(
        UTCDateTime(),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
