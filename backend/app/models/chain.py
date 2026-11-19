from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, ForeignKey

from app.database import Base, UTCDateTime


class Chain(Base):
    """A decision chain: one topic's decision evolution.

    A chain holds the decision nodes (versions) of one subject — the
    initial decision, the discussion around it, and the follow-up
    decisions (a reversal is simply the next node). Members work the
    chain; when they consider it mature they submit it to the
    supervisor, whose verdict and annotations come back to the chain.
    """

    __tablename__ = "chains"

    id = Column(Integer, primary_key=True, index=True)

    project_id = Column(
        Integer,
        ForeignKey("projects.id"),
        nullable=False
    )

    title = Column(
        String(200),
        nullable=False
    )

    # Submitted to the supervisor at this moment. None while the chain
    # is still being discussed; re-submission updates the timestamp.
    submitted_at = Column(
        UTCDateTime(),
        nullable=True
    )

    created_at = Column(
        UTCDateTime(),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
