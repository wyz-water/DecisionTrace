from datetime import date

from pydantic import BaseModel


class GraphNode(BaseModel):
    id: int
    owner: str
    description: str
    status: str
    due_date: date | None = None


class GraphEdge(BaseModel):
    id: int
    predecessor_commitment_id: int
    successor_commitment_id: int
    dependency_type: str


class NodeAnalysis(BaseModel):
    commitment_id: int
    status: str
    state: str
    blocked_by: list[int]
    waiting_on: list[int]


class ProjectGraphResponse(BaseModel):
    project_id: int
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    cycles: list[list[int]]
    has_cycles: bool
    topological_order: list[int]
    analysis: list[NodeAnalysis]
