from datetime import datetime

from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime

from app.database import Base


class CommitmentHistory(Base):
    __tablename__ = "commitment_history"

    id = Column(Integer, primary_key=True, index=True)

    commitment_id = Column(
        Integer,
        ForeignKey("commitments.id"),
        nullable=False
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
        DateTime,
        nullable=False,
        default=datetime.utcnow
    )