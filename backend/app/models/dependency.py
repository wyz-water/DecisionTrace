from sqlalchemy import Column, Integer, String, ForeignKey
from app.database import Base


class Dependency(Base):
    __tablename__ = "dependencies"

    id = Column(Integer, primary_key=True, index=True)

    project_id = Column(
        Integer,
        ForeignKey("projects.id"),
        nullable=False
    )

    predecessor_commitment_id = Column(
        Integer,
        ForeignKey("commitments.id"),
        nullable=False
    )

    successor_commitment_id = Column(
        Integer,
        ForeignKey("commitments.id"),
        nullable=False
    )

    dependency_type = Column(
        String(50),
        nullable=False,
        default="BLOCKS"
    )