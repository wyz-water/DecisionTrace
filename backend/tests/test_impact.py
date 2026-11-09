import copy
import unittest

from app.services.impact import simulate_impact


def node(node_id, owner, status="OPEN"):
    return {
        "id": node_id,
        "owner": owner,
        "description": f"Task {node_id}",
        "status": status,
    }


def edge(edge_id, predecessor, successor, dependency_type="BLOCKS"):
    return {
        "id": edge_id,
        "predecessor_commitment_id": predecessor,
        "successor_commitment_id": successor,
        "dependency_type": dependency_type,
    }


class ImpactSimulationTests(unittest.TestCase):
    def test_chain_preview_reports_newly_affected_nodes(self):
        commitments = [node(1, "Carol"), node(2, "Bob"), node(3, "Alice")]
        edges = [edge(1, 1, 2), edge(2, 2, 3)]

        result = simulate_impact(1, "DELAYED", commitments, edges)

        self.assertEqual(result["total"], 2)
        self.assertEqual(result["current_total"], 0)
        self.assertEqual(result["newly_affected"], [2, 3])
        self.assertEqual(result["already_affected"], [])
        self.assertEqual(
            [item["depth"] for item in result["affected"]],
            [1, 2],
        )
        self.assertEqual(result["affected"][1]["path"], [1, 2, 3])
        self.assertEqual(result["affected"][1]["owner"], "Alice")
        self.assertTrue(
            all(item["newly_affected"] for item in result["affected"])
        )

    def test_fork_preview_keeps_shortest_paths_and_depth(self):
        commitments = [
            node(1, "Carol"),
            node(2, "Bob"),
            node(3, "Alice"),
            node(4, "Noah"),
        ]
        edges = [
            edge(1, 1, 2),
            edge(2, 1, 3),
            edge(3, 2, 4),
        ]

        result = simulate_impact(1, "BLOCKED", commitments, edges)

        self.assertEqual(result["newly_affected"], [2, 3, 4])
        self.assertEqual(result["affected"][0]["path"], [1, 2])
        self.assertEqual(result["affected"][1]["path"], [1, 3])
        self.assertEqual(result["affected"][2]["path"], [1, 2, 4])
        self.assertEqual(result["affected"][2]["depth"], 2)

    def test_same_status_moves_everything_to_already_affected(self):
        commitments = [
            node(1, "Carol", "DELAYED"),
            node(2, "Bob"),
            node(3, "Alice"),
        ]
        edges = [edge(1, 1, 2), edge(2, 2, 3)]

        result = simulate_impact(1, "DELAYED", commitments, edges)

        self.assertEqual(result["current_total"], 2)
        self.assertEqual(result["newly_affected"], [])
        self.assertEqual(result["already_affected"], [2, 3])
        self.assertTrue(
            all(not item["newly_affected"] for item in result["affected"])
        )

    def test_completed_source_can_still_be_previewed(self):
        commitments = [
            node(1, "Carol", "COMPLETED"),
            node(2, "Bob"),
        ]
        edges = [edge(1, 1, 2)]

        result = simulate_impact(1, "DELAYED", commitments, edges)

        self.assertEqual(result["current_total"], 0)
        self.assertEqual(result["newly_affected"], [2])
        self.assertEqual(result["total"], 1)

    def test_isolated_source_has_no_downstream_impact(self):
        result = simulate_impact(
            1,
            "DELAYED",
            [node(1, "Carol")],
            [],
        )

        self.assertEqual(result["total"], 0)
        self.assertEqual(result["affected"], [])
        self.assertEqual(result["newly_affected"], [])
        self.assertEqual(result["already_affected"], [])
        self.assertFalse(result["has_cycle"])

    def test_cycle_is_reported_and_does_not_loop_forever(self):
        commitments = [node(1, "Carol"), node(2, "Bob"), node(3, "Alice")]
        edges = [edge(1, 1, 2), edge(2, 2, 3), edge(3, 3, 1)]

        result = simulate_impact(1, "DELAYED", commitments, edges)

        self.assertTrue(result["has_cycle"])
        self.assertEqual(result["total"], 2)
        self.assertEqual(result["newly_affected"], [2, 3])

    def test_non_risk_status_has_no_preview(self):
        result = simulate_impact(
            1,
            "OPEN",
            [node(1, "Carol"), node(2, "Bob")],
            [edge(1, 1, 2)],
        )

        self.assertEqual(result["total"], 0)
        self.assertEqual(result["affected"], [])

    def test_simulation_does_not_mutate_inputs(self):
        commitments = [node(1, "Carol"), node(2, "Bob")]
        edges = [edge(1, 1, 2)]
        commitments_before = copy.deepcopy(commitments)
        edges_before = copy.deepcopy(edges)

        simulate_impact(1, "DELAYED", commitments, edges)

        self.assertEqual(commitments, commitments_before)
        self.assertEqual(edges, edges_before)
        self.assertEqual(commitments[0]["status"], "OPEN")


if __name__ == "__main__":
    unittest.main()
