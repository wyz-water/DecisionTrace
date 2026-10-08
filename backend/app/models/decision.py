from sqlalchemy import Column, Integer, String, Text, ForeignKey
from app.database import Base


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