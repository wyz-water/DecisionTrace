"""Pure diff between two saved graph snapshots.

A snapshot stores the same shape the live graph endpoint returns:
``nodes``, ``edges``, ``cycles``, ``topological_order`` and ``analysis``.
This module compares two of those payloads without touching the database
or any ORM object, so the same function can be unit-tested with plain
dictionaries and reused by the API route.

Cycles are deliberately not part of the diff: dependency creation rejects
an edge that would close a loop, so a saved project graph cannot gain or
lose a cycle through normal use. Keeping a cycle section would only show
a permanent pair of zeroes.

The comparison is deliberately conservative:

- nodes are matched by commitment id; a field is reported only when its
  stored value actually changed;
- edges are matched by ``(predecessor, successor, type)``, because an
  edge that changes type is a removal plus an addition, not a silent
  mutation;
- topological order is compared by rank. A new node inserted before an
  existing one can shift several ranks; that is reported as movement
  rather than hidden behind a longest-common-subsequence heuristic.
"""

NODE_FIELDS = ("status", "due_date", "owner", "description")


def _as_int(value):
    """Return ``value`` as an int, or None when it is not an id."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _nodes_by_id(graph):
    nodes = {}

    for node in graph.get("nodes") or []:
        if not isinstance(node, dict):
            continue

        node_id = _as_int(node.get("id"))

        if node_id is not None:
            nodes[node_id] = node

    return nodes


def _edges_by_key(graph):
    edges = {}

    for edge in graph.get("edges") or []:
        if not isinstance(edge, dict):
            continue

        predecessor = _as_int(edge.get("predecessor_commitment_id"))
        successor = _as_int(edge.get("successor_commitment_id"))
        dependency_type = edge.get("dependency_type")

        if predecessor is None or successor is None:
            continue

        edges[(predecessor, successor, dependency_type)] = edge

    return edges


def _order(graph):
    """Normalise a topological order to unique integer ids, preserving order."""
    order = []
    seen = set()

    for raw_id in graph.get("topological_order") or []:
        node_id = _as_int(raw_id)

        if node_id is not None and node_id not in seen:
            seen.add(node_id)
            order.append(node_id)

    return order


def _rank_map(order):
    return {node_id: index + 1 for index, node_id in enumerate(order)}


def _analysis_by_id(graph):
    analysis = {}

    for item in graph.get("analysis") or []:
        if not isinstance(item, dict):
            continue

        node_id = _as_int(item.get("commitment_id"))

        if node_id is not None:
            analysis[node_id] = item

    return analysis


def _owner(labels, node_id):
    return labels.get(node_id, {}).get("owner") or f"#{node_id}"


def _edge_view(edge, labels):
    predecessor = _as_int(edge.get("predecessor_commitment_id"))
    successor = _as_int(edge.get("successor_commitment_id"))

    return {
        "id": edge.get("id"),
        "predecessor_commitment_id": predecessor,
        "successor_commitment_id": successor,
        "dependency_type": edge.get("dependency_type"),
        "predecessor_owner": _owner(labels, predecessor),
        "successor_owner": _owner(labels, successor),
    }


def diff_graphs(before_graph, after_graph):
    """Compare two graph JSON payloads.

    Returns a JSON-serialisable structure with ``summary`` counts and
    detail arrays. The result is a pure value: neither input is mutated.
    """
    before_nodes = _nodes_by_id(before_graph)
    after_nodes = _nodes_by_id(after_graph)

    before_edges = _edges_by_key(before_graph)
    after_edges = _edges_by_key(after_graph)

    # Use the after-snapshot label where possible: it reflects the current
    # owner after a rename, while still labelling nodes that were removed.
    labels = {}

    for node_id, node in before_nodes.items():
        labels[node_id] = {
            "owner": node.get("owner") or f"#{node_id}",
            "description": node.get("description") or "",
        }

    for node_id, node in after_nodes.items():
        labels[node_id] = {
            "owner": node.get("owner") or f"#{node_id}",
            "description": node.get("description") or "",
        }

    before_ids = set(before_nodes)
    after_ids = set(after_nodes)

    nodes_added = [after_nodes[node_id] for node_id in sorted(after_ids - before_ids)]
    nodes_removed = [
        before_nodes[node_id] for node_id in sorted(before_ids - after_ids)
    ]

    nodes_changed = []

    for node_id in sorted(before_ids & after_ids):
        before_node = before_nodes[node_id]
        after_node = after_nodes[node_id]
        changes = {}

        for field in NODE_FIELDS:
            before_value = before_node.get(field)
            after_value = after_node.get(field)

            if before_value != after_value:
                changes[field] = {
                    "from": before_value,
                    "to": after_value,
                }

        if changes:
            nodes_changed.append({
                "id": node_id,
                "before": before_node,
                "after": after_node,
                "changes": changes,
            })

    edge_keys_before = set(before_edges)
    edge_keys_after = set(after_edges)

    edges_added = [
        _edge_view(after_edges[key], labels)
        for key in sorted(edge_keys_after - edge_keys_before)
    ]
    edges_removed = [
        _edge_view(before_edges[key], labels)
        for key in sorted(edge_keys_before - edge_keys_after)
    ]

    before_order = _order(before_graph)
    after_order = _order(after_graph)
    before_rank = _rank_map(before_order)
    after_rank = _rank_map(after_order)

    common_ranked = set(before_rank) & set(after_rank)

    topology_moved = [
        {
            "id": node_id,
            "owner": _owner(labels, node_id),
            "from_rank": before_rank[node_id],
            "to_rank": after_rank[node_id],
        }
        for node_id in sorted(common_ranked)
        if before_rank[node_id] != after_rank[node_id]
    ]

    topology_added = [
        {"id": node_id, "owner": _owner(labels, node_id)}
        for node_id in after_order
        if node_id not in before_rank
    ]

    topology_removed = [
        {"id": node_id, "owner": _owner(labels, node_id)}
        for node_id in before_order
        if node_id not in after_rank
    ]

    before_analysis = _analysis_by_id(before_graph)
    after_analysis = _analysis_by_id(after_graph)

    analysis_changed = []

    for node_id in sorted(set(before_analysis) & set(after_analysis)):
        before_state = before_analysis[node_id].get("state")
        after_state = after_analysis[node_id].get("state")

        if before_state != after_state:
            analysis_changed.append({
                "commitment_id": node_id,
                "owner": _owner(labels, node_id),
                "from": before_state,
                "to": after_state,
            })

    topology_order_changed = before_order != after_order

    summary = {
        "nodes_added": len(nodes_added),
        "nodes_removed": len(nodes_removed),
        "nodes_changed": len(nodes_changed),
        "edges_added": len(edges_added),
        "edges_removed": len(edges_removed),
        "topology_order_changed": topology_order_changed,
        "topology_moved": len(topology_moved),
        "analysis_changed": len(analysis_changed),
    }

    summary["has_changes"] = any(
        summary[key]
        for key in (
            "nodes_added",
            "nodes_removed",
            "nodes_changed",
            "edges_added",
            "edges_removed",
            "topology_order_changed",
            "topology_moved",
            "analysis_changed",
        )
    )

    return {
        "summary": summary,
        "nodes": {
            "added": nodes_added,
            "removed": nodes_removed,
            "changed": nodes_changed,
        },
        "edges": {
            "added": edges_added,
            "removed": edges_removed,
        },
        "topology": {
            "order_changed": topology_order_changed,
            "from_order": before_order,
            "to_order": after_order,
            "added": topology_added,
            "removed": topology_removed,
            "moved": topology_moved,
        },
        "analysis": {
            "changed": analysis_changed,
        },
    }
