"""Uniform envelope for paginated list endpoints.

The client needs three facts to render a pager: how many records exist in
total, where this slice starts, and whether another slice exists. Keeping
them in one shape means the frontend has exactly one pagination contract
instead of one per resource.
"""

from typing import Generic, TypeVar

from pydantic import BaseModel

ItemT = TypeVar("ItemT")


class Page(BaseModel, Generic[ItemT]):
    items: list[ItemT]
    total: int
    limit: int
    offset: int
    has_more: bool
