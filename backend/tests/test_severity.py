import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.candidate import Candidate  # noqa: F401 - registers table
from app.models.commitment import Commitment
from app.models.commitment_history import CommitmentHistory  # noqa: F401
from app.models.decision import Decision  # noqa: F401 - registers table
from app.models.decision_history import DecisionHistory  # noqa: F401
from app.models.dependency import Dependency
from app.models.discussion import Discussion  # noqa: F401 - registers table
from app.models.project import Project
from app.models.snapshot import Snapshot  # noqa: F401 - registers table
from app.routes.commitments import get_commitment_what_if
from app.services.impact import (
    SEVERITY_LABELS,
    severity_propagation,
    simulate_impact,
)


def node(node_id, owner="A", status="OPEN"):
    return {
        "id": node_id,
        "owner": owner,
        "description": f"work {node_id}",
        "status": status,
    }


def edge(edge_id, predecessor, successor):
    return {
        "id": edge_id,
        "predecessor_commitment_id": predecessor,
        "successor_commitment_id": successor,
        "dependency_type": "BLOCKS",
    }


def level(labels, node_id):
    return labels.get(node_id, 0)


class SeverityPropagationTests(unittest.TestCase):
    """BLOCKED outranks DELAYED; severity flows along BLOCKS edges;
    COMPLETED nodes are immune and isolate their downstream."""

    def test_delayed_source_propagates_delayed_downstream(self):
        commitments = [node(1), node(2), node(3)]
        edges = [edge(1, 1, 2), edge(2, 2, 3)]

        levels = severity_propagation(
            {c["id"]: type("N", (), c)() for c in commitments},
            [type("E", (), e)() for e in edges],
            overrides={1: "DELAYED"},
        )

        self.assertEqual(level(levels, 1), 1)
        self.assertEqual(level(levels, 2), 1)
        self.assertEqual(level(levels, 3), 1)

    def test_blocked_dominates_delayed_from_another_predecessor(self):
        commitments = [
            node(1, status="BLOCKED"),
            node(2, status="DELAYED"),
            node(3),
        ]
        edges = [edge(1, 1, 3), edge(2, 2, 3)]

        levels = severity_propagation(
            {c["id"]: type("N", (), c)() for c in commitments},
            [type("E", (), e)() for e in edges],
        )

        self.assertEqual(level(levels, 3), 2)

    def test_completed_node_is_immune_and_isolates_downstream(self):
        commitments = [node(1), node(2, status="COMPLETED"), node(3)]
        edges = [edge(1, 1, 2), edge(2, 2, 3)]

        levels = severity_propagation(
            {c["id"]: type("N", (), c)() for c in commitments},
            [type("E", (), e)() for e in edges],
            overrides={1: "BLOCKED"},
        )

        self.assertEqual(level(levels, 1), 2)
        self.assertEqual(level(levels, 2), 0)
        self.assertEqual(level(levels, 3), 0)

    def test_severity_reaches_downstream_via_a_second_path(self):
        # The first path goes through a completed node; the second does
        # not — the leaf is still affected via the second path.
        commitments = [
            node(1),
            node(2, status="COMPLETED"),
            node(3),
            node(4),
        ]
        edges = [edge(1, 1, 2), edge(2, 2, 4), edge(3, 1, 3), edge(4, 3, 4)]

        levels = severity_propagation(
            {c["id"]: type("N", (), c)() for c in commitments},
            [type("E", (), e)() for e in edges],
            overrides={1: "DELAYED"},
        )

        self.assertEqual(level(levels, 2), 0)
        self.assertEqual(level(levels, 3), 1)
        self.assertEqual(level(levels, 4), 1)

    def test_own_delayed_status_counts_without_override(self):
        commitments = [node(1, status="DELAYED")]
        levels = severity_propagation(
            {1: type("N", (), commitments[0])()},
            [],
        )
        self.assertEqual(level(levels, 1), 1)

    def test_labels(self):
        self.assertEqual(SEVERITY_LABELS[2], "BLOCKED")
        self.assertEqual(SEVERITY_LABELS[1], "DELAYED")
        self.assertIsNone(SEVERITY_LABELS[0])


class SeveritySimulationTests(unittest.TestCase):
    """The what-if simulation reports per-item severity, tier counts for
    the affected set before and after, and the escalated ids."""

    def test_what_if_reports_severity_counts_and_escalation(self):
        commitments = [node(1), node(2), node(3)]
        edges = [edge(1, 1, 2), edge(2, 2, 3)]

        result = simulate_impact(1, "BLOCKED", commitments, edges)

        self.assertEqual(result["total"], 2)
        self.assertEqual(result["severity_counts"], {"blocked": 2, "delayed": 0})
        self.assertEqual(
            result["baseline_severity_counts"], {"blocked": 0, "delayed": 0}
        )
        self.assertEqual(result["escalated"], [2, 3])
        self.assertTrue(all(
            item["severity"] == "BLOCKED"
            and item["baseline_severity"] is None
            for item in result["affected"]
        ))

    def test_existing_blocked_node_keeps_its_severity(self):
        commitments = [node(1), node(2, status="BLOCKED")]
        edges = [edge(1, 1, 2)]

        result = simulate_impact(1, "DELAYED", commitments, edges)

        item = result["affected"][0]
        self.assertEqual(item["severity"], "BLOCKED")
        self.assertEqual(item["baseline_severity"], "BLOCKED")
        self.assertNotIn(item["id"], result["escalated"])
        self.assertEqual(result["severity_counts"], {"blocked": 1, "delayed": 0})
        self.assertEqual(
            result["baseline_severity_counts"], {"blocked": 1, "delayed": 0}
        )

    def test_completed_middle_isolates_downstream_in_simulation(self):
        commitments = [node(1), node(2, status="COMPLETED"), node(3)]
        edges = [edge(1, 1, 2), edge(2, 2, 3)]

        result = simulate_impact(1, "BLOCKED", commitments, edges)

        self.assertEqual(result["total"], 0)
        self.assertEqual(result["severity_counts"], {"blocked": 0, "delayed": 0})

    def test_blocked_hypothetical_escalates_delayed_baseline(self):
        commitments = [
            node(1),
            node(2, status="DELAYED"),
            node(3),
        ]
        edges = [edge(1, 1, 2), edge(2, 2, 3)]

        result = simulate_impact(1, "BLOCKED", commitments, edges)

        by_id = {item["id"]: item for item in result["affected"]}

        self.assertEqual(by_id[2]["baseline_severity"], "DELAYED")
        self.assertEqual(by_id[2]["severity"], "BLOCKED")
        self.assertEqual(by_id[3]["baseline_severity"], "DELAYED")
        self.assertEqual(by_id[3]["severity"], "BLOCKED")
        self.assertEqual(result["escalated"], [2, 3])
        self.assertEqual(
            result["baseline_severity_counts"], {"blocked": 0, "delayed": 2}
        )
        self.assertEqual(
            result["severity_counts"], {"blocked": 2, "delayed": 0}
        )


class SeverityRouteTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        project = Project(name="Severity test", description="temporary")
        self.db.add(project)
        self.db.flush()

        self.source = Commitment(
            project_id=project.id, owner="Carol",
            description="Schema", status="OPEN",
        )
        self.middle = Commitment(
            project_id=project.id, owner="Bob",
            description="API", status="DELAYED",
        )
        self.leaf = Commitment(
            project_id=project.id, owner="Alice",
            description="Runbook", status="OPEN",
        )
        self.db.add_all([self.source, self.middle, self.leaf])
        self.db.flush()

        self.db.add_all([
            Dependency(
                project_id=project.id,
                predecessor_commitment_id=self.source.id,
                successor_commitment_id=self.middle.id,
                dependency_type="BLOCKS",
            ),
            Dependency(
                project_id=project.id,
                predecessor_commitment_id=self.middle.id,
                successor_commitment_id=self.leaf.id,
                dependency_type="BLOCKS",
            ),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_route_payload_carries_severity_fields(self):
        result = get_commitment_what_if(
            self.source.id, "BLOCKED", db=self.db
        )

        by_id = {item["id"]: item for item in result["affected"]}

        self.assertEqual(by_id[self.middle.id]["baseline_severity"], "DELAYED")
        self.assertEqual(by_id[self.middle.id]["severity"], "BLOCKED")
        self.assertEqual(by_id[self.leaf.id]["baseline_severity"], "DELAYED")
        self.assertEqual(by_id[self.leaf.id]["severity"], "BLOCKED")
        self.assertEqual(result["escalated"], [self.middle.id, self.leaf.id])
        self.assertEqual(result["severity_counts"], {"blocked": 2, "delayed": 0})
        self.assertEqual(
            result["baseline_severity_counts"], {"blocked": 0, "delayed": 2}
        )


if __name__ == "__main__":
    unittest.main()
