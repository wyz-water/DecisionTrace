from datetime import datetime, timezone

from sqlalchemy import Column, Integer, Text, ForeignKey

from app.database import Base, UTCDateTime


class ChainAnnotation(Base):
    """A supervisor annotation on a chain.

    Annotations are first-class: the supervisor may annotate without
    deciding (guidance), or attach a note to any verdict. They stay
    bound to the chain as part of its trace — a rejection never
    deletes the chain, it adds to its history.
    """

    __tablename__ = "chain_annotations"

    id = Column(Integer, primary_key=True, index=True)

    chain_id = Column(
        Integer,
        ForeignKey("chains.id"),
        nullable=False
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
