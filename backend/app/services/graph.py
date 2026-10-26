"""Graph algorithms for DecisionTrace.

The project trace is a directed graph: commitments are nodes and
dependencies are edges (predecessor -> successor). This module provides:

- topological ordering (what can start / what is still blocked),
- cycle detection (circular dependencies),
- transitive impact analysis (downstream closure along dependency edges).
"""

from collections import defaultdict, deque


def build_adjacency(edges):
    """Return (successors, predecessors) maps of node_id -> list of
    (neighbor_id, dependency_type)."""
    successors = defaultdict(list)
    predecessors = defaultdict(list)

    for edge in edges:
        successors[edge.predecessor_commitment_id].append(
            (edge.successor_commitment_id, edge.dependency_type)
        )
        predecessors[edge.successor_commitment_id].append(
            (edge.predecessor_commitment_id, edge.dependency_type)
        )

    return successors, predecessors


def detect_cycles(edges, node_ids):
    """Find every elementary cycle in the graph.

    Each cycle is returned once, starting at its smallest node id and
    including the closing node (e.g. [1, 2, 1]).
    """
    successors, _ = build_adjacency(edges)

    cycles = []

    for start in sorted(node_ids):
        # Stack of (node, iterator over its outgoing edges).
        stack = [(start, iter(successors.get(start, [])))]
        path = [start]
        on_path = {start}

        while stack:
            node, outgoing = stack[-1]
            advanced = False

            for neighbor, _dependency_type in outgoing:
                if neighbor == start:
                    cycles.append(path + [start])
                elif neighbor > start and neighbor not in on_path:
                    # Only follow nodes greater than start: each cycle is
                    # then reported exactly once, at its minimum node.
                    on_path.add(neighbor)
                    path.append(neighbor)
                    stack.append(
                        (neighbor, iter(successors.get(neighbor, [])))
                    )
                    advanced = True
                    break

            if not advanced:
                stack.pop()
                on_path.discard(path.pop())

    return cycles


def topological_order(edges, node_ids):
    """Kahn's algorithm.

    Returns the topological order of all nodes that are not part of a
    cycle. Nodes on cycles are omitted.
    """
    _, predecessors = build_adjacency(edges)

    indegree = {
        node_id: len(predecessors.get(node_id, []))
        for node_id in node_ids
    }

    successors, _ = build_adjacency(edges)

    queue = deque(
        node_id
        for node_id in node_ids
        if indegree[node_id] == 0
    )

    order = []

    while queue:
        node_id = queue.popleft()
        order.append(node_id)

        for neighbor, _dependency_type in successors.get(node_id, []):
            indegree[neighbor] -= 1

            if indegree[neighbor] == 0:
                queue.append(neighbor)

    return order


def analyze_node_states(commitments_by_id, edges):
    """Classify each commitment's readiness.

    States:
    - DONE:    the commitment itself is completed
    - CYCLIC:  the commitment sits on a dependency cycle
    - BLOCKED: at least one predecessor is DELAYED or BLOCKED
    - WAITING: predecessors exist and none are done yet (but none risky)
    - READY:   nothing stands in the way
    """
    successors, predecessors = build_adjacency(edges)

    node_ids = list(commitments_by_id.keys())

    cycles = detect_cycles(edges, node_ids)
    cyclic_ids = {
        node_id
        for cycle in cycles
        for node_id in cycle
    }

    risky = {"DELAYED", "BLOCKED"}

    analysis = []

    for node_id in node_ids:
        commitment = commitments_by_id[node_id]

        if node_id in cyclic_ids:
            state = "CYCLIC"
            blocked_by = []
            waiting_on = []
        else:
            preds = predecessors.get(node_id, [])

            blocked_by = [
                pred_id
                for pred_id, _dependency_type in preds
                if commitments_by_id[pred_id].status in risky
            ]

            waiting_on = [
                pred_id
                for pred_id, _dependency_type in preds
                if pred_id not in blocked_by
                and commitments_by_id[pred_id].status != "COMPLETED"
            ]

            if commitment.status == "COMPLETED":
                state = "DONE"
            elif blocked_by:
                state = "BLOCKED"
            elif waiting_on:
                state = "WAITING"
            else:
                state = "READY"

        analysis.append({
            "commitment_id": node_id,
            "status": commitment.status,
            "state": state,
            "blocked_by": blocked_by,
            "waiting_on": waiting_on,
        })

    return analysis


def transitive_impact(source_id, source_status, commitments_by_id, edges):
    """Breadth-first traversal from the source commitment.

    Returns every commitment reachable along dependency edges, with the
    shortest path from the source. Empty when the source status is not
    DELAYED/BLOCKED.
    """
    if source_status not in {"DELAYED", "BLOCKED"}:
        return []

    successors, _ = build_adjacency(edges)

    affected = []
    visited = {source_id}

    queue = deque([(source_id, [source_id])])

    while queue:
        node_id, path = queue.popleft()

        for neighbor, dependency_type in successors.get(node_id, []):
            if neighbor in visited:
                continue

            visited.add(neighbor)

            affected.append({
                "commitment": commitments_by_id[neighbor],
                "dependency_type": dependency_type,
                "path": path + [neighbor],
                "depth": len(path),
            })

            queue.append((neighbor, path + [neighbor]))

    return affected
