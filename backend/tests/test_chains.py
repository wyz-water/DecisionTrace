import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.argument import Argument  # noqa: F401 - registers table
from app.models.candidate import Candidate  # noqa: F401 - registers table
from app.models.chain import Chain
from app.models.chain_comment import ChainComment
from app.models.commitment import Commitment  # noqa: F401
from app.models.commitment_history import CommitmentHistory  # noqa: F401
from app.models.decision import Decision
from app.models.decision_dependency import DecisionDependency  # noqa: F401
from app.models.decision_history import DecisionHistory  # noqa: F401
from app.models.dependency import Dependency  # noqa: F401
from app.models.discussion import Discussion  # noqa: F401 - registers table
from app.models.project import Project
from app.models.snapshot import Snapshot  # noqa: F401 - registers table
from app.models.commitment import Commitment
from app.models.dependency import Dependency
from app.routes.chains import (
    add_chain_comment,
    add_chain_task,
    append_chain_node,
    create_chain,
    get_chain,
    get_chain_execution,
    get_chains,
    submit_chain,
    teacher_action,
)
from app.schemas.chain import (
    ChainCommentCreate,
    ChainCreate,
    ChainNodeCreate,
    TeacherAction,
)
from app.schemas.execution import ExecutionTaskCreate


class ChainTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.project = Project(name="Chain test", description="temporary")
        self.db.add(self.project)
        self.db.flush()

        self.decision = Decision(
            project_id=self.project.id,
            title="Use Redis",
            rationale="it scales well",
            decided_by="Alice",
            status="CONFIRMED",
        )
        self.db.add(self.decision)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_create_chain_from_decision(self):
        chain = create_chain(
            ChainCreate(
                project_id=self.project.id,
                decision_id=self.decision.id,
            ),
            db=self.db,
        )

        self.assertEqual(chain.title, "Use Redis")
        self.assertEqual(len(chain.nodes), 1)
        self.assertEqual(chain.nodes[0].id, self.decision.id)
        self.assertIsNone(chain.submitted_at)
        self.assertIsNone(chain.teacher_status)

        self.db.expire_all()
        refreshed = self.db.query(Decision).filter(
            Decision.id == self.decision.id
        ).first()
        self.assertEqual(refreshed.chain_id, chain.id)

    def test_decision_cannot_join_two_chains(self):
        create_chain(
            ChainCreate(
                project_id=self.project.id,
                decision_id=self.decision.id,
            ),
            db=self.db,
        )

        with self.assertRaises(HTTPException) as raised:
            create_chain(
                ChainCreate(
                    project_id=self.project.id,
                    decision_id=self.decision.id,
                ),
                db=self.db,
            )

        self.assertEqual(raised.exception.status_code, 400)

    def test_append_nodes_extends_the_chain(self):
        chain = create_chain(
            ChainCreate(
                project_id=self.project.id,
                decision_id=self.decision.id,
            ),
            db=self.db,
        )

        node = append_chain_node(
            chain.id,
            ChainNodeCreate(
                title="Use Memcached",
                rationale="simpler",
                decided_by="Bob",
            ),
            db=self.db,
        )

        detail = get_chain(chain.id, db=self.db)

        self.assertEqual(node.chain_id, chain.id)
        self.assertEqual([n.title for n in detail.nodes],
                         ["Use Redis", "Use Memcached"])

    def test_append_node_requires_a_title(self):
        chain = create_chain(
            ChainCreate(
                project_id=self.project.id,
                decision_id=self.decision.id,
            ),
            db=self.db,
        )

        with self.assertRaises(HTTPException) as raised:
            append_chain_node(
                chain.id,
                ChainNodeCreate(title="  "),
                db=self.db,
            )

        self.assertEqual(raised.exception.status_code, 400)

    def test_comments_bind_to_the_chain(self):
        chain = create_chain(
            ChainCreate(
                project_id=self.project.id,
                decision_id=self.decision.id,
            ),
            db=self.db,
        )

        comment = add_chain_comment(
            chain.id,
            ChainCommentCreate(author="Carol", text="what about cost?"),
            db=self.db,
        )

        detail = get_chain(chain.id, db=self.db)

        self.assertEqual(len(detail.comments), 1)
        self.assertEqual(detail.comments[0].author, "Carol")
        self.assertIsNone(comment.decision_id)

    def test_comment_pinned_to_a_node_must_be_a_node(self):
        chain = create_chain(
            ChainCreate(
                project_id=self.project.id,
                decision_id=self.decision.id,
            ),
            db=self.db,
        )

        with self.assertRaises(HTTPException) as raised:
            add_chain_comment(
                chain.id,
                ChainCommentCreate(text="hi", decision_id=9999),
                db=self.db,
            )

        self.assertEqual(raised.exception.status_code, 400)

    def test_comment_text_is_required(self):
        chain = create_chain(
            ChainCreate(
                project_id=self.project.id,
                decision_id=self.decision.id,
            ),
            db=self.db,
        )

        with self.assertRaises(HTTPException) as raised:
            add_chain_comment(
                chain.id,
                ChainCommentCreate(text="   "),
                db=self.db,
            )

        self.assertEqual(raised.exception.status_code, 400)

    def test_submit_sets_pending_and_resubmit_updates(self):
        chain = create_chain(
            ChainCreate(
                project_id=self.project.id,
                decision_id=self.decision.id,
            ),
            db=self.db,
        )

        first = submit_chain(chain.id, db=self.db)

        self.assertIsNotNone(first.submitted_at)
        self.assertEqual(first.teacher_status, "PENDING")

        import time
        time.sleep(0.01)

        second = submit_chain(chain.id, db=self.db)

        self.assertEqual(second.teacher_status, "PENDING")
        self.assertGreaterEqual(second.submitted_at, first.submitted_at)

    def test_teacher_action_sets_verdict_and_annotation(self):
        chain = create_chain(
            ChainCreate(
                project_id=self.project.id,
                decision_id=self.decision.id,
            ),
            db=self.db,
        )
        submit_chain(chain.id, db=self.db)

        detail = teacher_action(
            chain.id,
            TeacherAction(
                status="APPROVED",
                note="good reasoning, proceed",
            ),
            db=self.db,
        )

        self.assertEqual(detail.teacher_status, "APPROVED")
        self.assertEqual(len(detail.annotations), 1)
        self.assertEqual(
            detail.annotations[0].text, "good reasoning, proceed"
        )

    def test_annotation_alone_is_allowed(self):
        chain = create_chain(
            ChainCreate(
                project_id=self.project.id,
                decision_id=self.decision.id,
            ),
            db=self.db,
        )
        submit_chain(chain.id, db=self.db)

        detail = teacher_action(
            chain.id,
            TeacherAction(note="please add a cost comparison"),
            db=self.db,
        )

        self.assertEqual(detail.teacher_status, "PENDING")
        self.assertEqual(len(detail.annotations), 1)

    def test_invalid_verdict_is_rejected(self):
        chain = create_chain(
            ChainCreate(
                project_id=self.project.id,
                decision_id=self.decision.id,
            ),
            db=self.db,
        )
        submit_chain(chain.id, db=self.db)

        with self.assertRaises(HTTPException) as raised:
            teacher_action(
                chain.id,
                TeacherAction(status="MAYBE"),
                db=self.db,
            )

        self.assertEqual(raised.exception.status_code, 400)

    def test_empty_action_is_rejected(self):
        chain = create_chain(
            ChainCreate(
                project_id=self.project.id,
                decision_id=self.decision.id,
            ),
            db=self.db,
        )

        with self.assertRaises(HTTPException) as raised:
            teacher_action(
                chain.id,
                TeacherAction(),
                db=self.db,
            )

        self.assertEqual(raised.exception.status_code, 400)

    def test_submitted_only_filter(self):
        chain = create_chain(
            ChainCreate(
                project_id=self.project.id,
                decision_id=self.decision.id,
            ),
            db=self.db,
        )

        self.assertEqual(
            get_chains(project_id=self.project.id, submitted_only=True, db=self.db),
            [],
        )

        submit_chain(chain.id, db=self.db)

        submitted = get_chains(
            project_id=self.project.id, submitted_only=True, db=self.db
        )
        self.assertEqual(len(submitted), 1)

    def _approved_chain(self):
        chain = create_chain(
            ChainCreate(
                project_id=self.project.id,
                decision_id=self.decision.id,
            ),
            db=self.db,
        )
        submit_chain(chain.id, db=self.db)
        teacher_action(
            chain.id,
            TeacherAction(status="APPROVED"),
            db=self.db,
        )
        return chain

    def test_tasks_require_approval(self):
        chain = create_chain(
            ChainCreate(
                project_id=self.project.id,
                decision_id=self.decision.id,
            ),
            db=self.db,
        )
        submit_chain(chain.id, db=self.db)

        with self.assertRaises(HTTPException) as raised:
            add_chain_task(
                chain.id,
                ExecutionTaskCreate(owner="Dora", description="ship it"),
                db=self.db,
            )

        self.assertEqual(raised.exception.status_code, 400)

    def test_add_task_after_approval(self):
        chain = self._approved_chain()

        task = add_chain_task(
            chain.id,
            ExecutionTaskCreate(owner="Dora", description="ship it"),
            db=self.db,
        )

        self.assertEqual(task.owner, "Dora")
        self.assertEqual(task.status, "OPEN")

        self.db.expire_all()
        stored = self.db.query(Commitment).filter(
            Commitment.id == task.id
        ).first()
        self.assertEqual(stored.chain_id, chain.id)

    def test_execution_topological_order_and_checks(self):
        chain = self._approved_chain()

        first = add_chain_task(
            chain.id,
            ExecutionTaskCreate(owner="Dora", description="schema"),
            db=self.db,
        )
        second = add_chain_task(
            chain.id,
            ExecutionTaskCreate(owner="Eve", description="api"),
            db=self.db,
        )
        self.db.add(Dependency(
            project_id=self.project.id,
            predecessor_commitment_id=first.id,
            successor_commitment_id=second.id,
            dependency_type="BLOCKS",
        ))
        self.db.commit()

        execution = get_chain_execution(chain.id, db=self.db)

        positions = {task.id: task.position for task in execution["tasks"]}
        self.assertLess(positions[first.id], positions[second.id])
        self.assertEqual(execution["checks"], [])
        self.assertFalse(execution["has_cycles"])

        # block the first task: the second becomes blocked, a check fires
        first_commitment = self.db.query(Commitment).filter(
            Commitment.id == first.id
        ).first()
        first_commitment.status = "DELAYED"
        self.db.commit()

        execution = get_chain_execution(chain.id, db=self.db)

        by_id = {task.id: task for task in execution["tasks"]}
        self.assertEqual(by_id[second.id].state, "BLOCKED")
        self.assertEqual(by_id[second.id].blocked_by, ["Dora"])
        self.assertTrue(any(
            check["type"] == "blocked" for check in execution["checks"]
        ))

    def test_out_of_order_check(self):
        chain = self._approved_chain()

        first = add_chain_task(
            chain.id,
            ExecutionTaskCreate(owner="Dora", description="schema"),
            db=self.db,
        )
        second = add_chain_task(
            chain.id,
            ExecutionTaskCreate(owner="Eve", description="api"),
            db=self.db,
        )
        self.db.add(Dependency(
            project_id=self.project.id,
            predecessor_commitment_id=first.id,
            successor_commitment_id=second.id,
            dependency_type="BLOCKS",
        ))
        self.db.commit()

        # Eve starts before Dora finished: ordering violation
        second_commitment = self.db.query(Commitment).filter(
            Commitment.id == second.id
        ).first()
        second_commitment.status = "IN_PROGRESS"
        self.db.commit()

        execution = get_chain_execution(chain.id, db=self.db)

        self.assertTrue(any(
            check["type"] == "out_of_order" for check in execution["checks"]
        ))

    def test_list_chains_reports_counts(self):
        create_chain(
            ChainCreate(
                project_id=self.project.id,
                decision_id=self.decision.id,
            ),
            db=self.db,
        )

        chains = get_chains(project_id=self.project.id, db=self.db)

        self.assertEqual(len(chains), 1)
        self.assertEqual(chains[0].node_count, 1)
        self.assertEqual(chains[0].comment_count, 0)


if __name__ == "__main__":
    unittest.main()
