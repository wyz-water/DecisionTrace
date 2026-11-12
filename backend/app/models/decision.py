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

    status = Column(
        String(50),
        nullable=False,
        default="CONFIRMED"
    )

    # When the decision was recorded. Feeds the retrospective metrics
    # (lifespan of overturned decisions) and future staleness checks.
    created_at = Column(
        UTCDateTime(),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )