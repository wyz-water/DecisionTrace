from sqlalchemy import Column, Integer, String, ForeignKey

from app.database import Base


class DecisionDependency(Base):
    """A decision-level dependency edge: predecessor -> successor.

    Decisions rest on other decisions ("we chose Redis after we had
    decided to move to the cloud"), so the reasoning layer of the graph
    is not a flat list of verdicts — it has its own structure. These
    edges enter through the same candidate gate (A2) and are
    cycle-checked at confirm time, like commitment dependencies.
    """

    __tablename__ = "decision_dependencies"

    id = Column(Integer, primary_key=True, index=True)

    project_id = Column(
        Integer,
        ForeignKey("projects.id"),
        nullable=False
    )

    predecessor_decision_id = Column(
        Integer,
        ForeignKey("decisions.id"),
        nullable=False
    )

    successor_decision_id = Column(
        Integer,
        ForeignKey("decisions.id"),
        nullable=False
    )

    dependency_type = Column(
        String(50),
        nullable=False,
        default="DEPENDS_ON"
    )
