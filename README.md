# DecisionTrace

An AI decision analyst for course projects: **one supervisor, many
student groups**. Students paste their meeting discussions, the system
extracts decisions for human review, discussions grow into decision
chains, the supervisor approves a decision point per chain, and only
then does execution start — tasks, topological order, and AI checks.

## The Model

```text
Student group                          Supervisor
─────────────────────                  ─────────────────────
Meeting text (paste/import)
      ↓ extract → candidates → review
Decisions ──→ Decision chains ──submit──→ Awaiting decision
   (per-node discussion,     (full chain inline; annotate /
    revisions as new nodes)   approve / hold / reject ANY point)
                                        Approved point
                                              ↓
Execution (tasks, topological order, AI checks)
        ←──── supervisor watches read-only, per group ────
```

Key rules:

- **Approval is a selection.** The supervisor picks the decision point
  they judge best — not necessarily the newest. Choosing one overrules
  the chain's other points (they become *Rejected*), and the chain
  locks: no further revisions while it executes.
- **The AI proposes, humans confirm.** Extraction (rule engine first,
  optional LLM path) yields candidates with the exact source sentence;
  nothing is written without the human gate.
- **Everything derived is computed, never stored** — chain status,
  node states (waiting/ready/blocked), topological order, checks.
- **Numbers are project-scoped.** Chains are `#1..#N`, chain points
  read `#chain-node` (`#1-2`), free decisions `#1..#M`.

## Layout

```text
SUPERVISOR   Awaiting decision · In progress
DECIDE       Decisions · Decision chains · Intake & review
EXECUTE      Decision list · Tasks & commitments · Execution order · Problems
```

## Stack & Run

Backend: FastAPI + SQLAlchemy + SQLite. Frontend: React (Vite).

```bash
cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --port 8000

cd ../frontend
npm install
npm run dev            # http://localhost:5173
```

Demo data (two groups, three weeks of activity — approved and
executing, held-and-revised, submitted, drafts in EN and ZH):

```bash
cd backend && .venv/Scripts/python seed_demo.py
# reset anytime: cp decisiontrace.pristine.db decisiontrace.db
```

Tests: `cd backend && .venv/Scripts/python -m unittest discover -s tests`

## Documentation

- Assignment 2 design artifacts: `docs/design/` (architecture,
  API spec, data model, UI design, models, requirements changelog, …)
- SRS (Part I): `docs/SRS/`
- Instructor demo script: `docs/demo-script.md`
