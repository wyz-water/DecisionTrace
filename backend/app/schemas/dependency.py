from pydantic import BaseModel, ConfigDict


class DependencyCreate(BaseModel):
    project_id: int
    predecessor_commitment_id: int
    successor_commitment_id: int
    dependency_type: str = "BLOCKS"


class DependencyResponse(BaseModel):
    id: int
    project_id: int
    predecessor_commitment_id: int
    successor_commitment_id: int
    dependency_type: str

    model_config = ConfigDict(from_attributes=True)