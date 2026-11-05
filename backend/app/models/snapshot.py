from datetime import datetime, timezone

from sqlalchemy import Column, ForeignKey, Integer, JSON, String

from app.database import Base, UTCDateTime


class Snapshot(Base):
    """One saved copy of a project's dependency graph.

    The graph payload (nodes, edges, topological order, cycle and
    blocked-by analysis) is stored as a JSON column at the moment the
    snapshot is taken, so the snapshot stays a truthful record even as
    the live graph keeps changing — the same principle as the history
    tables, applied to the graph as a whole.
    """

    __tablename__ = "snapshots"

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

    graph = Column(
        JSON,
        nullable=False
    )

    created_at = Column(
        UTCDateTime(),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
