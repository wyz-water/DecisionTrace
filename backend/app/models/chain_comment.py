from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Text, ForeignKey

from app.database import Base, UTCDateTime


class ChainComment(Base):
    """A discussion message on a decision chain.

    Questions and objections are all just discussion: chat-style
    messages under the chain (optionally pinned to one decision node).
    They stay strictly bound to the chain as the trace of the
    deliberation — no FOR/AGAINST taxonomy, no resolve ritual.
    """

    __tablename__ = "chain_comments"

    id = Column(Integer, primary_key=True, index=True)

    chain_id = Column(
        Integer,
        ForeignKey("chains.id"),
        nullable=False
    )

    # The decision node this comment was made under; null for comments
    # on the chain in general.
    decision_id = Column(
        Integer,
        ForeignKey("decisions.id"),
        nullable=True
    )

    author = Column(
        String(80),
        nullable=True
    )

    text = Column(
        Text,
        nullable=False
    )

    created_at = Column(
        UTCDateTime(),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
