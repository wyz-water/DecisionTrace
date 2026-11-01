"""Offset pagination shared by the list endpoints.

Offset paging (rather than cursors) is deliberate: these lists are small,
they are sorted by a stable key, and the UI shows a page count — which a
cursor cannot provide without a second query.

The cap on ``limit`` is what keeps a single request bounded; the frontend
asks for 3-4 rows at a time, so the cap is a safety rail, not a design
constraint.
"""

from fastapi import Query

DEFAULT_LIMIT = 20
MAX_LIMIT = 100


class PageParams:
    """Validated ``limit`` / ``offset`` query parameters."""

    def __init__(
        self,
        limit: int = Query(
            DEFAULT_LIMIT,
            ge=1,
            le=MAX_LIMIT,
            description="Maximum number of records to return.",
        ),
        offset: int = Query(
            0,
            ge=0,
            description="Number of records to skip.",
        ),
    ):
        self.limit = limit
        self.offset = offset


def paginate(query, page: PageParams):
    """Return ``(rows, total)`` for one page of an already ordered query.

    ``order_by(None)`` keeps SQLite from sorting the whole table just to
    count it; the count itself is order independent.
    """
    total = query.order_by(None).count()
    rows = query.offset(page.offset).limit(page.limit).all()

    return rows, total


def page_response(items, total: int, page: PageParams):
    return {
        "items": items,
        "total": total,
        "limit": page.limit,
        "offset": page.offset,
        "has_more": page.offset + len(items) < total,
    }
