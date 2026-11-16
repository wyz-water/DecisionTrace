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
    build_adjacency,
    detect_cycles,
    downstream_closure,
    topological_order,
    transitive_impact,
)

RISK_STATUSES = frozenset({"DELAYED", "BLOCKED"})

# Severity of a status: how hard it stops the work behind it. BLOCKED
# outranks DELAYED, everything else carries nothing. A COMPLETED node is
# immune and isolates: its work is done, so nothing downstream of it is
# at risk through it — and a hypothetical cannot travel through a
# completed middle node to reach the leaves.
SEVERITY_VALUES = {"BLOCKED": 2, "DELAYED": 1}
SEVERITY_LABELS = {2: "BLOCKED", 1: "DELAYED", 0: None}


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


def _affected_view(item, current_ids, baseline_levels, simulated_levels):
    commitment = item["commitment"]
    node_id = commitment.id

    return {
        "id": node_id,
        "owner": commitment.owner,
        "description": commitment.description,
        "status": commitment.status,
        "dependency_type": item["dependency_type"],
        "reason": " → ".join(f"#{n}" for n in item["path"]),
        "path": item["path"],
        "depth": item["depth"],
        "newly_affected": node_id not in current_ids,
        "baseline_severity": SEVERITY_LABELS.get(
            baseline_levels.get(node_id, 0)
        ),
        "severity": SEVERITY_LABELS.get(
            simulated_levels.get(node_id, 0)
        ),
    }


def severity_propagation(commitments_by_id, edges, overrides=None):
    """Effective severity of every commitment, propagated along BLOCKS
    edges in topological order.

    effective(n) = max(own severity, max over predecessors of their
    effective severity). A COMPLETED node (not overridden) is severity 0
    and passes nothing through: downstream of finished work is not at
    risk through it. Overrides (what-if statuses) apply literally, so a
    hypothetical on the source itself is honored even when the source is
    completed — the user is deliberately testing "what if this slips".
    Nodes on cycles take their own severity only (cycles are rejected on
    write; this is belt-and-braces).
    """
    overrides = overrides or {}
    _, predecessors = build_adjacency(edges)

    levels = {}

    for node_id, commitment in commitments_by_id.items():
        if node_id in overrides:
            levels[node_id] = SEVERITY_VALUES.get(
                overrides[node_id], 0
            )
        elif commitment.status == "COMPLETED":
            levels[node_id] = 0
        else:
            levels[node_id] = SEVERITY_VALUES.get(
                commitment.status, 0
            )

    node_ids = list(commitments_by_id)

    order = topological_order(edges, node_ids)

    for node_id in order:
        node = commitments_by_id[node_id]

        if node_id not in overrides and node.status == "COMPLETED":
            continue

        for predecessor, _dependency_type in predecessors.get(
            node_id, []
        ):
            if levels.get(predecessor, 0) > levels[node_id]:
                levels[node_id] = levels[predecessor]

    # Nodes on cycles are omitted from the topological order; relax them
    # to a fixpoint instead. Severity only rises and caps at 2, so this
    # terminates — cycles are rejected on write, this is belt-and-braces.
    cycle_ids = [node_id for node_id in node_ids if node_id not in set(order)]

    changed = True

    while changed:
        changed = False

        for node_id in cycle_ids:
            node = commitments_by_id[node_id]

            if node_id not in overrides and node.status == "COMPLETED":
                continue

            for predecessor, _dependency_type in predecessors.get(
                node_id, []
            ):
                if levels.get(predecessor, 0) > levels[node_id]:
                    levels[node_id] = levels[predecessor]
                    changed = True

    return levels


def _severity_counts(levels, node_ids):
    blocked = 0
    delayed = 0

    for node_id in node_ids:
        if levels.get(node_id) == 2:
            blocked += 1
        elif levels.get(node_id) == 1:
            delayed += 1

    return {"blocked": blocked, "delayed": delayed}


def simulate_impact(source_id, hypothetical_status, commitments, edges):
    """Compare current impact with a hypothetical DELAYED/BLOCKED status.

    Returns ``affected`` (new and already affected together, in BFS
    order, each with baseline and simulated severity), the two id lists,
    severity counts for the affected set before and after, the
    ``escalated`` ids (severity strictly increased), totals, and a cycle
    flag. ``affected`` is empty when the hypothetical status does not put
    anything at risk — severity stops at completed middle nodes, so a
    completed commitment isolates its downstream.
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

    empty = {
        "affected": [],
        "newly_affected": [],
        "already_affected": [],
        "escalated": [],
        "total": 0,
        "current_total": 0,
        "severity_counts": {"blocked": 0, "delayed": 0},
        "baseline_severity_counts": {"blocked": 0, "delayed": 0},
        "has_cycle": has_cycle,
    }

    if source is None:
        return empty

    current = transitive_impact(
        source.id,
        source.status,
        commitments_by_id,
        normalized_edges,
    )
    current_ids = {item["commitment"].id for item in current}

    hypothetical = (hypothetical_status or "").upper()

    baseline_levels = severity_propagation(
        commitments_by_id, normalized_edges
    )

    if hypothetical not in RISK_STATUSES:
        return empty

    simulated_levels = severity_propagation(
        commitments_by_id,
        normalized_edges,
        overrides={source.id: hypothetical},
    )

    simulated = [
        item
        for item in downstream_closure(
            source.id, commitments_by_id, normalized_edges
        )
        if simulated_levels.get(item["commitment"].id, 0) > 0
    ]

    affected = [
        _affected_view(
            item, current_ids, baseline_levels, simulated_levels
        )
        for item in simulated
    ]

    affected_ids = [item["id"] for item in affected]

    return {
        "affected": affected,
        "newly_affected": [
            item["id"] for item in affected if item["newly_affected"]
        ],
        "already_affected": [
            item["id"] for item in affected if not item["newly_affected"]
        ],
        "escalated": [
            item["id"]
            for item in affected
            if (simulated_levels.get(item["id"], 0) >
                baseline_levels.get(item["id"], 0))
        ],
        "total": len(affected),
        "current_total": len(current),
        "severity_counts": _severity_counts(
            simulated_levels, affected_ids
        ),
        "baseline_severity_counts": _severity_counts(
            baseline_levels, affected_ids
        ),
        "has_cycle": has_cycle,
    }
