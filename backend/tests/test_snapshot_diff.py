import unittest

from app.services.snapshot_diff import diff_graphs


def node(node_id, owner, status="OPEN", due_date="2026-11-20"):
    return {
        "id": node_id,
        "owner": owner,
        "description": f"Task {node_id}",
        "due_date": due_date,
        "status": status,
    }


def edge(edge_id, predecessor, successor, dependency_type="BLOCKS"):
    return {
        "id": edge_id,
        "predecessor_commitment_id": predecessor,
        "successor_commitment_id": successor,
        "dependency_type": dependency_type,
    }


def graph(nodes, edges=None, order=None, cycles=None, analysis=None):
    return {
        "nodes": nodes,
        "edges": edges or [],
        "topological_order": order if order is not None else [
            item["id"] for item in nodes
        ],
        "cycles": cycles or [],
        "analysis": analysis or [],
    }


class SnapshotDiffTests(unittest.TestCase):
    def test_identical_snapshots_have_no_changes(self):
        snapshot = graph([node(1, "Carol"), node(2, "Bob")])

        diff = diff_graphs(snapshot, snapshot)

        self.assertFalse(diff["summary"]["has_changes"])
        self.assertEqual(diff["summary"]["nodes_changed"], 0)

    def test_nodes_and_edges_are_compared_by_identity(self):
        before = graph(
            [node(1, "Carol"), node(2, "Bob")],
            edges=[edge(1, 1, 2)],
            order=[1, 2],
        )
        after = graph(
            [node(1, "Carol"), node(2, "Bob", "DELAYED"), node(3, "Alice")],
            edges=[edge(1, 1, 2), edge(2, 2, 3)],
            order=[1, 2, 3],
        )

        diff = diff_graphs(before, after)

        self.assertEqual(diff["summary"]["nodes_added"], 1)
        self.assertEqual(diff["summary"]["nodes_changed"], 1)
        self.assertEqual(diff["summary"]["edges_added"], 1)
        self.assertEqual(diff["nodes"]["changed"][0]["id"], 2)
        self.assertEqual(
            diff["nodes"]["changed"][0]["changes"]["status"],
            {"from": "OPEN", "to": "DELAYED"},
        )

    def test_dependency_type_change_is_a_removal_plus_addition(self):
        before = graph([node(1, "Carol"), node(2, "Bob")], edges=[edge(1, 1, 2)])
        after = graph(
            [node(1, "Carol"), node(2, "Bob")],
            edges=[edge(1, 1, 2, "INFORMS")],
        )

        diff = diff_graphs(before, after)

        self.assertEqual(diff["summary"]["edges_added"], 1)
        self.assertEqual(diff["summary"]["edges_removed"], 1)
        self.assertEqual(diff["edges"]["added"][0]["dependency_type"], "INFORMS")
        self.assertEqual(diff["edges"]["removed"][0]["dependency_type"], "BLOCKS")

    def test_removed_nodes_and_edges_are_reported(self):
        before = graph(
            [node(1, "Carol"), node(2, "Bob")],
            edges=[edge(1, 1, 2)],
            order=[1, 2],
        )
        after = graph([node(1, "Carol")], order=[1])

        diff = diff_graphs(before, after)

        self.assertEqual(diff["summary"]["nodes_removed"], 1)
        self.assertEqual(diff["summary"]["edges_removed"], 1)
        self.assertEqual(diff["nodes"]["removed"][0]["id"], 2)
        self.assertEqual(diff["topology"]["removed"], [{"id": 2, "owner": "Bob"}])
        self.assertTrue(diff["summary"]["has_changes"])

    def test_topology_reports_rank_movements(self):
        before = graph(
            [node(1, "Carol"), node(2, "Bob"), node(3, "Alice")],
            order=[1, 2, 3],
        )
        after = graph(
            [node(1, "Carol"), node(2, "Bob"), node(3, "Alice")],
            order=[2, 1, 3],
        )

        diff = diff_graphs(before, after)

        self.assertTrue(diff["summary"]["topology_order_changed"])
        self.assertEqual(diff["summary"]["topology_moved"], 2)
        self.assertEqual(
            [
                (item["id"], item["from_rank"], item["to_rank"])
                for item in diff["topology"]["moved"]
            ],
            [(1, 1, 2), (2, 2, 1)],
        )

    def test_cycles_are_not_part_of_the_diff(self):
        # Dependency creation rejects a loop before it is stored, so the
        # comparison intentionally has no cycle section.
        before = graph(
            [node(1, "Carol"), node(2, "Bob")],
            order=[1, 2],
        )
        after = graph(
            [node(1, "Carol"), node(2, "Bob")],
            order=[1, 2],
            cycles=[[1, 2, 1]],
        )

        diff = diff_graphs(before, after)

        self.assertNotIn("cycles", diff)
        self.assertNotIn("cycles_appeared", diff["summary"])
        self.assertFalse(diff["summary"]["has_changes"])

    def test_analysis_state_changes_are_reported(self):
        before = graph(
            [node(1, "Carol"), node(2, "Bob")],
            order=[1, 2],
            analysis=[
                {
                    "commitment_id": 1,
                    "status": "OPEN",
                    "state": "READY",
                    "blocked_by": [],
                    "waiting_on": [],
                },
                {
                    "commitment_id": 2,
                    "status": "OPEN",
                    "state": "WAITING",
                    "blocked_by": [],
                    "waiting_on": [1],
                },
            ],
        )
        after = graph(
            [node(1, "Carol"), node(2, "Bob")],
            order=[1, 2],
            analysis=[
                {
                    "commitment_id": 1,
                    "status": "OPEN",
                    "state": "READY",
                    "blocked_by": [],
                    "waiting_on": [],
                },
                {
                    "commitment_id": 2,
                    "status": "BLOCKED",
                    "state": "BLOCKED",
                    "blocked_by": [1],
                    "waiting_on": [],
                },
            ],
        )

        diff = diff_graphs(before, after)

        self.assertEqual(diff["summary"]["analysis_changed"], 1)
        self.assertEqual(diff["analysis"]["changed"][0]["from"], "WAITING")
        self.assertEqual(diff["analysis"]["changed"][0]["to"], "BLOCKED")


if __name__ == "__main__":
    unittest.main()
