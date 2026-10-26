# AI Artifacts — Representative Prompts

Prompts used with AI tools during this project. Full chat logs are kept by each
member; these are the representative ones that shaped the deliverables.

## 1. Idea phase (ChatGPT)

- "We are a student team designing a system for a System Analysis and Design
  course. Our idea is to preserve the reasoning, commitments and dependencies
  behind team decisions. Compare it with Jira, Notion, meeting assistants and
  ADR tools — where exactly is the gap, and how should we phrase the
  differentiation so it is a hypothesis rather than a claim?"
- "Draft an 8-use-case overview (UC01–UC08) for: import discussion, AI
  extraction, human review, decision create/revise, commitment tracking,
  dependency management, conflict/impact detection, history search."

## 2. Requirements analysis (this document)

- "Write the SRS Introduction (400–800 words) for DecisionTrace, refined from
  the idea submission, incorporating these instructor feedback points: …"
  *(the four feedback points are listed verbatim in §2.7 of the SRS)*
- "Draft a risk register with likelihood / impact / mitigation for: AI
  extraction errors, circular dependencies, LLM latency & cost, privacy,
  scope creep, confirmation fatigue, semester time limits."

## 3. Modelling and diagrams

- PlantUML source for the use case diagram (`diagrams/use-cases.puml`) was
  written and rendered through the kroki.io API.
- Mermaid sources for the domain graph, roadmap Gantt chart and the three
  activity diagrams (`diagrams/*.mmd`) — rendered via kroki.io.

## 4. Implementation (Claude Code)

- "Build the FastAPI backend with models: Project, Discussion, Decision,
  Commitment, Dependency, CommitmentHistory; add status-update endpoint with
  audit trail and an impact endpoint that detects downstream commitments when
  a commitment is DELAYED or BLOCKED."
- "Build the React dashboard: decision card, impact card, commitment cards
  with inline status editing, dependency trace, audit timeline."
- "Take screenshots of the running dashboard and the four HTML mockups using
  Playwright."

## 5. Verification

- Every AI-generated code change went through the PR workflow: branch →
  commit → PR → review → squash merge (main branch protected).
- Every SRS section drafted by AI was reviewed and edited by team members;
  the instructor-feedback points in §2.7 were integrated by hand.
