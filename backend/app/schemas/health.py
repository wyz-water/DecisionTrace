from pydantic import BaseModel


class ProjectHealthResponse(BaseModel):
    """Computed decision health metrics (services/retrospective.py).

    Rates are fractions 0..1 rounded to 3 decimals, None when undefined
    (e.g. no decisions yet). Nothing here is stored: the numbers derive
    from the append-only history and the arguments on every read.
    """

    project_id: int

    decisions_total: int

    overturned_count: int
    overturn_rate: float | None
    avg_overturn_lifespan_days: float | None

    revised_count: int
    revision_rate: float | None

    contested_count: int
    contested_rate: float | None

    open_objections: int
    resolved_objections: int
    objection_resolution_rate: float | None
