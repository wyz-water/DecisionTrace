"""Response shape for the full-text search endpoint.

One flat item per hit, whatever its source table. The ``kind`` field tells
the frontend which badge to show and which view the result links to; the
optional context fields are filled in where the source table has them.
"""

from pydantic import BaseModel


class SearchResult(BaseModel):
    id: int
    kind: str  # discussion | decision | commitment | decision_history | commitment_history
    project_id: int

    title: str
    snippet: str
    matched_field: str

    # Context fields, filled where the source has them.
    status: str | None = None
    owner: str | None = None
    decision_id: int | None = None
    commitment_id: int | None = None
    source_discussion_id: int | None = None
    changed_at: str | None = None
