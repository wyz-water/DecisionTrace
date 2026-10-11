# DecisionTrace

DecisionTrace is an AI-assisted decision traceability system for team projects.

It helps teams preserve not only **what was decided**, but also **why it was decided, who committed to what, how work items depend on each other, and what may be affected when something changes**.

## Problem

Traditional project management tools are good at tracking tasks, but important project context is often scattered across meetings, messages, and discussions.

For example:

> The team decides to use PostgreSQL because payment transactions require transaction support.  
> Carol commits to completing the database schema by Friday.  
> Bob's backend API depends on Carol's schema.

A normal task tracker may record Carol's and Bob's tasks, but it may lose the reasoning and dependency behind them.

If Carol's work is delayed or the team later proposes switching databases, it becomes difficult to answer:

- Why was PostgreSQL originally selected?
- Who made commitments based on that decision?
- Which tasks depend on those commitments?
- Who may be affected by the change?
- How has the decision or commitment changed over time?

DecisionTrace is designed to preserve this chain.

## Core Traceability Model

```text
Discussion
    ↓
Decision
    ↓
Rationale
    ↓
Commitment
    ↓
Dependency
    ↓
Execution
    ↓
Change
    ↓
Impact & Traceability
```

The goal is to make project decisions explainable and traceable throughout the project lifecycle.

## Key Features

### Decision & Rationale Tracking

Records project decisions together with their rationale and source discussion.

### Commitment Tracking

Connects decisions to concrete commitments, including:

- owner
- description
- due date
- current status

Supported statuses currently include:

- `OPEN`
- `IN_PROGRESS`
- `DELAYED`
- `BLOCKED`
- `COMPLETED`

### Dependency Tracking

Represents relationships between commitments.

For example:

```text
Carol: Complete database schema
              │
            BLOCKS
              ↓
Bob: Implement backend API
```

### Impact Detection

When an upstream commitment becomes `DELAYED` or `BLOCKED`, DecisionTrace can identify downstream commitments that may be affected.

### Audit Trail

Status changes are recorded so that the system preserves a history of how commitments evolve over time.

### AI-Assisted Extraction — Planned

DecisionTrace is designed to support AI-assisted extraction from team discussions.

The intended workflow is:

```text
Team Discussion
      ↓
AI extracts candidate information
      ↓
Decision / Commitment / Dependency Candidates
      ↓
Human Review
   ┌────┼────┐
Confirm Edit Reject
      ↓
Confirmed project records
```

AI-generated information is treated as a **candidate**, not an authoritative project record.

A human user must review the result before it becomes part of the official project trace.

## Current Demo Scenario

The current prototype demonstrates the following scenario:

1. The team chooses **PostgreSQL**.
2. The rationale is that payment transactions require transaction support.
3. **Carol** commits to completing the PostgreSQL database schema.
4. **Bob** commits to implementing the backend API.
5. Bob's work depends on Carol's schema.
6. Carol's commitment becomes delayed.
7. DecisionTrace detects Bob's commitment as potentially affected.
8. The status change is preserved in the audit trail.

## Tech Stack

### Frontend

- React
- Vite
- JavaScript
- CSS

### Backend

- Python
- FastAPI
- SQLAlchemy

### Database

- SQLite

SQLite is currently used for development and prototyping. The architecture can later be migrated to another relational database if needed.

## Project Structure

```text
DecisionTrace/
│
├── backend/
│   ├── app/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── schemas/
│   │   ├── database.py
│   │   └── main.py
│   │
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   ├── package.json
│   └── vite.config.js
│
├── .gitignore
└── README.md
```

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/wyz-water/DecisionTrace.git
cd DecisionTrace
```

### 2. Start the backend

Create a Python virtual environment:

```bash
cd backend
python -m venv .venv
```

Activate it in Git Bash on Windows:

```bash
source .venv/Scripts/activate
```

Install the dependencies:

```bash
pip install -r requirements.txt
```

Start FastAPI:

```bash
uvicorn app.main:app --reload
```

The backend will run at:

```text
http://127.0.0.1:8000
```

FastAPI documentation is available at:

```text
http://127.0.0.1:8000/docs
```

### 3. Start the frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend will normally run at:

```text
http://localhost:5173
```

## Development Workflow

To maintain code quality and collaboration consistency, the project follows a pull-request-based workflow.

Workflow:

1. Each team member creates a feature branch.
2. Changes are committed and pushed to the feature branch.
3. A Pull Request is created for review.
4. Changes require approval before merging into the main branch.
5. Approved changes are merged using squash merge.

Direct pushes to the main branch are restricted.

## Development Status

DecisionTrace is currently under active development.

Implemented:

- Decision tracking
- Decision rationale
- Commitment tracking
- Commitment status updates
- Dependency relationships
- Downstream impact detection
- Commitment change history / audit trail
- React dashboard
- FastAPI REST API

Planned:

- Discussion management UI
- AI extraction candidates
- Human Confirm / Edit / Reject workflow
- Decision change tracking
- Conflict detection
- Improved project-level traceability
- Additional testing and validation

## Design Principle

DecisionTrace follows a human-in-the-loop approach:

> **AI assists with identifying project information. Humans remain responsible for confirming project decisions and commitments.**

The system should preserve traceability between the original discussion, the reasoning behind a decision, resulting commitments, dependencies, later changes, and their downstream impact.

## Team

Developed as a group project for **System Analysis and Design**.