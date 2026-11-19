from sqlalchemy import Column, Integer, String, Text, ForeignKey, Date
from app.database import Base


class Commitment(Base):
    __tablename__ = "commitments"

    id = Column(Integer, primary_key=True, index=True)

    project_id = Column(
        Integer,
        ForeignKey("projects.id"),
        nullable=False
    )

    decision_id = Column(
        Integer,
        ForeignKey("decisions.id"),
        nullable=True
    )

    # The chain this task belongs to (execution phase): tasks come
    # from the chain discussion after the supervisor approved it.
    chain_id = Column(
        Integer,
        ForeignKey("chains.id"),
        nullable=True
    )

    owner = Column(
        String(100),
        nullable=False
    )

    description = Column(
        Text,
        nullable=False
    )

    due_date = Column(
        Date,
        nullable=True
    )

    status = Column(
        String(50),
        nullable=False,
        default="OPEN"
    )