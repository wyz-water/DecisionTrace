# Contributing

Team conventions for working on DecisionTrace (Course Project 8).

## Branch & PR Workflow

1. Start from the latest main: `git checkout main && git pull`
2. One branch per feature: `git checkout -b feature/<name>` (branch names
   are free-form; only `main` is protected)
3. Push and open a **pull request** to `main` — **pushes alone send no
   notification**; the PR is how the team lead sees and reviews your work
4. The lead reviews and merges with **squash**. Because the merge is a
   squash, your old branch no longer matches main history: **delete the
   merged branch and start the next feature from fresh main**, never
   continue on the old branch
5. If main moves while you work: `git merge origin/main`, resolve, keep going

## Before Opening a PR

- Backend: `backend/.venv/Scripts/python -m py_compile <changed files>`
- Frontend: `npm run build` **and** `npm run lint` — a broken build or
  invalid UTF-8 bytes (some editors corrupt `—`/`→` characters) blocks the
  merge
- Try the empty state too: a fresh database must still let you create the
  first project from the UI

## The Demo Database

`backend/decisiontrace.db` is the curated demo matching the README
scenario (PostgreSQL decision, Carol DELAYED → Bob blocked, 3 pending
candidates). **Never test writes against it.** Use a temporary copy:

```bash
mkdir /tmp/dt_test && cp -r backend/app /tmp/dt_test/ && cp backend/decisiontrace.db /tmp/dt_test/
cd /tmp/dt_test && ../backend/.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

## UI Verification

Playwright lives in the **backend venv only** (system Python does not
have it). Throwaway driver scripts go under `%LOCALAPPDATA%\Temp\dt_verify\`,
screenshots under `D:/tmp/`.

## Code Style

- Backend: one router per entity in `app/routes/` (HTTP only), pure
  functions in `app/services/` (no HTTP objects), Pydantic models in
  `app/schemas/`. Every list endpoint returns the shared pagination
  envelope — build on `services/pagination.py`, never invent a new shape.
- Frontend: components in `src/components/`, one view per job. Register
  new views in `views.js` (the sidebar and router read the same list).
- Status values are constrained: decision `CONFIRMED/SUPERSEDED/REVOKED`,
  commitment `OPEN/IN_PROGRESS/COMPLETED/DELAYED/BLOCKED`, candidate
  `PENDING/CONFIRMED/REJECTED`. New statuses go through `statuses.py`
  and the UI badge colors.
- AI output stays a **candidate** until a human confirms it. No endpoint
  may create an authoritative record directly from extracted text.

## Documentation

Design docs live in `docs/design/`; keep them in sync when you change the
API surface or the data model. The SRS (course deliverable) lives in
`docs/SRS/` — its working copy is the desktop `srs.docx`; sync changes
through the team lead.
