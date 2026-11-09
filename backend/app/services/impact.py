"""Read-only what-if impact simulation.

The real impact endpoint only reports downstream commitments when the
source is already DELAYED or BLOCKED. A what-if preview asks the opposite
question: "if this commitment were delayed or blocked, what would be
downstream?" The source's current status is therefore ignored for the
simulated closure, while the current closure is still computed so the UI
can separate already-affected commitments from newly-affected ones.

This module is pure: it never mutates the commitment or edge objects and
never touches the database. The route passes ORM rows; tests pass plain
dictionaries.
"""

from collections.abc import Mapping
from types import SimpleNamespace

from app.services.graph import (
    detect_cycles,
    downstream_closure,
    transitive_impact,
)

RISK_STATUSES = frozenset({"DELAYED", "BLOCKED"})


def _value(item, field, default=None):
    if isinstance(item, Mapping):
        return item.get(field, default)

    return getattr(item, field, default)


def _normalize_commitments(commitments):
    if isinstance(commitments, Mapping):
        items = commitments.values()
    else:
        items = commitments or []

    by_id = {}

    for item in items:
        raw_id = _value(item, "id")

        if raw_id is None:
            continue

        node_id = int(raw_id)
        by_id[node_id] = SimpleNamespace(
            id=node_id,
            owner=_value(item, "owner", ""),
            description=_value(item, "description", ""),
            status=_value(item, "status", "OPEN"),
        )

    return by_id


def _normalize_edges(edges, node_ids):
    normalized = []

    for edge in edges or []:
        predecessor = _value(edge, "predecessor_commitment_id")
        successor = _value(edge, "successor_commitment_id")

        if predecessor is None or successor is None:
            continue

        predecessor = int(predecessor)
        successor = int(successor)

        if predecessor not in node_ids or successor not in node_ids:
            continue

        normalized.append(SimpleNamespace(
            id=_value(edge, "id"),
            predecessor_commitment_id=predecessor,
            successor_commitment_id=successor,
            dependency_type=_value(edge, "dependency_type", "BLOCKS"),
        ))

    return normalized


def _affected_view(item, current_ids):
    commitment = item["commitment"]

    return {
        "id": commitment.id,
        "owner": commitment.owner,
        "description": commitment.description,
        "status": commitment.status,
        "dependency_type": item["dependency_type"],
        "reason": " → ".join(f"#{node_id}" for node_id in item["path"]),
        "path": item["path"],
        "depth": item["depth"],
        "newly_affected": commitment.id not in current_ids,
    }


def simulate_impact(source_id, hypothetical_status, commitments, edges):
    """Compare current impact with a hypothetical DELAYED/BLOCKED status.

    Returns ``affected`` (new and already affected together, in BFS
    order), the two id lists, totals, and a cycle flag. ``affected`` is
    empty when the hypothetical status does not put anything at risk.
    """
    commitments_by_id = _normalize_commitments(commitments)
    node_ids = set(commitments_by_id)
    normalized_edges = _normalize_edges(edges, node_ids)

    cycles = detect_cycles(normalized_edges, node_ids)
    has_cycle = len(cycles) > 0

    try:
        source_id = int(source_id)
    except (TypeError, ValueError):
        source_id = None

    source = commitments_by_id.get(source_id)

    if source is None:
        return {
            "affected": [],
            "newly_affected": [],
            "already_affected": [],
            "total": 0,
            "current_total": 0,
            "has_cycle": has_cycle,
        }

    current = transitive_impact(
        source.id,
        source.status,
        commitments_by_id,
        normalized_edges,
    )
    current_ids = {item["commitment"].id for item in current}

    hypothetical = (hypothetical_status or "").upper()

    simulated = (
        downstream_closure(source.id, commitments_by_id, normalized_edges)
        if hypothetical in RISK_STATUSES
        else []
    )

    affected = [
        _affected_view(item, current_ids)
        for item in simulated
    ]

    return {
        "affected": affected,
        "newly_affected": [
            item["id"] for item in affected if item["newly_affected"]
        ],
        "already_affected": [
            item["id"] for item in affected if not item["newly_affected"]
        ],
        "total": len(affected),
        "current_total": len(current),
        "has_cycle": has_cycle,
    }
