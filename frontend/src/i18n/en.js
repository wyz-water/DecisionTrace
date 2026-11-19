/**
 * English copy. Keys are flat so a missing translation is easy to spot
 * and `scripts/check_i18n_keys.py` can compare both dictionaries.
 *
 * Values may contain {placeholders}; `t()` interpolates them and `tp()`
 * picks the `.one` / `.other` variant for countable nouns.
 */
export default {

  "app.brand": "DecisionTrace",
  "app.tagline": "Decision intelligence & traceability",
  "app.loading": "Loading DecisionTrace…",
  "app.error": "Error: {message}",

  "app.noProjects": "No projects yet. Create one from the project switcher, top right of the page.",

  "nav.sections": "Sections",

  "nav.group.decide": "Decide",
  "nav.group.execute": "Execute",

  "nav.decisions": "Decisions",

  "nav.intake": "Intake & review",

  "language.label": "Language",

  "common.save": "Save",
  "common.saving": "Saving…",
  "common.cancel": "Cancel",
  "common.edit": "Edit",
  "common.delete": "Delete",
  "common.deleting": "Deleting…",
  "common.confirm": "Confirm",
  "common.confirmReject": "Confirm reject",
  "common.reject": "Reject",

  "common.back": "Back",

  "common.loading": "Loading…",
  "common.working": "Working…",
  "common.updating": "Updating…",

  "common.create": "Create",
  "common.creating": "Creating…",

  "common.noReason": "No reason provided.",
  "common.newestFirst": "Newest first",

  "common.title": "Title",
  "common.rationale": "Rationale",

  "common.optional": "Optional",

  "recordForm.openDecision": "New decision",

  "recordForm.decisionTitle": "Create a decision",

  "recordForm.manualDecisionHint": "Record the team's decision and reasoning. New decisions are confirmed.",

  "recordForm.sourceDiscussion": "Source discussion number",
  "recordForm.sourceDiscussionHint": "Use a discussion number from Intake & review in this project.",

  "recordForm.titleRequired": "Enter a decision title.",
  "recordForm.rationaleRequired": "Enter the decision goal (rationale).",
  "recordForm.goalNote": "the decision goal — required",

  "recordForm.invalidDiscussion": "Enter a positive whole-number discussion ID.",
  "recordForm.chooseProject": "Select a project before creating a record.",
  "recordForm.decisionFailed": "Could not create the decision. Your entries have been kept.",

  "recordForm.decisionCreated": "Decision #{id} was created. You can add another decision.",

  "status.DONE": "Done",
  "status.READY": "No blockers",

  "status.CYCLIC": "Part of a dependency cycle",

  "project.select": "Select a project",
  "project.find": "Find a project…",
  "project.noMatch": "No projects match “{query}”.",
  "project.deleteConfirm": "Delete “{name}”?",
  "project.deleteWarning": "All of its records will be removed.",
  "project.deleteAria": "Delete project {name}",
  "project.new": "+ New project…",
  "project.newTitle": "New project",
  "project.name": "Project name",
  "project.description": "Description (optional)",
  "project.create": "Create project",
  "project.couldNotDelete": "Could not delete the project.",
  "project.couldNotCreate": "Could not create the project.",

  "pagination.range": "{first}–{last} of {total}",
  "pagination.prev": "Prev",
  "pagination.next": "Next",
  "pagination.prevAria": "Previous page",
  "pagination.nextAria": "Next page",
  "pagination.pageAria": "Page {page}",
  "pagination.label": "{label} pages",

  "decisions.eyebrow": "DECIDE",
  "decisions.title": "Decisions",
  "decisions.subtitle": "The reasoning commitments must stay true to, and what a change to it puts at risk.",
  "decisions.unapprovedTable": "Decisions awaiting supervisor confirmation",
  "decisions.noChain": "No chain yet",
  "decisions.noUnapproved": "No unapproved decisions — they all moved to the execution group.",
  "decisions.cardEyebrow": "DECISION",
  "decisions.none": "No decision",
  "decisions.edit": "Edit",
  "decisions.titlePlaceholder": "Title",
  "decisions.rationalePlaceholder": "Rationale",
  "decisions.statusConfirmed": "Confirmed",
  "decisions.statusSuperseded": "Superseded",
  "decisions.statusRevoked": "Revoked",
  "decisions.reasonPlaceholder": "Reason for this change",
  "decisions.save": "Save",
  "decisions.saving": "Saving…",
  "decisions.rationale": "Rationale",
  "decisions.noRationale": "No rationale recorded.",
  "decisions.sourceDiscussion": "Source discussion #{id}",

  "decisions.historyEyebrow": "CHANGE HISTORY",
  "decisions.historyLabel": "Decision change history",
  "decisions.noHistory": "No changes recorded yet.",
  "decisions.titleRequired": "Title cannot be empty",
  "decisions.rationaleRequired": "The decision goal (rationale) cannot be empty.",
  "decisions.noChanges": "No changes to save",
  "decisions.failedUpdate": "Failed to update decision",

  "decisions.decidedBy": "Decided by {name}",
  "decisions.decidedByTeam": "Team decision",
  "decisions.decidedByPlaceholder": "Decision maker (optional)",

  "nav.chains": "Decision chains",
  "nav.group.execute": "EXECUTE",

  "execute.sectionDecisions": "Decision list",
  "execute.sectionTasks": "Tasks & commitments",
  "execute.sectionGraph": "Execution order",
  "execute.sectionProblems": "Problems",

  "execute.eyebrow": "EXECUTE",
  "execute.title": "Execution",
  "execute.subtitle": "Approved chains and their tasks, in execution order — with AI checks on cycles, blockers and ordering.",
  "execute.none": "No approved chains yet — the supervisor approves a chain first, then tasks appear here.",

  "execute.pickDecision": "Pick a decision",
  "execute.noDecisions": "No approved decisions yet — they move here after the supervisor approves their chain.",
  "execute.chainOf": "chain #{id}",
  "nav.group.teacher": "SUPERVISOR",

  "teacher.eyebrow": "SUPERVISOR",
  "teacher.title": "Teacher dashboard",
  "teacher.subtitle": "Submitted chains per group — read, annotate, decide.",
  "teacher.loadFailed": "Failed to load the teacher dashboard",

  "teacher.noGroups": "No groups yet.",

  "teacher.awaiting": "Awaiting decision",
  "teacher.noAwaiting": "Nothing awaiting a decision.",
  "teacher.inProgress": "In progress",
  "teacher.noInProgress": "No approved chains yet.",
  "teacher.annotations": "Supervisor annotations",
  "teacher.notePlaceholder": "Annotation (optional, works with or without a verdict)",
  "teacher.annotateOnly": "Annotate only",
  "teacher.approve": "Approve",
  "teacher.hold": "Hold",
  "teacher.reject": "Reject",

  "execution.taskCount": "{count} task(s)",
  "execution.none": "No tasks yet — the execution phase starts after approval.",
  "execution.loadFailed": "Failed to load the execution board",
  "execution.check.cycle": "CYCLE",
  "execution.check.blocked": "BLOCKED",
  "execution.check.out_of_order": "OUT OF ORDER",

  "execution.ownerPlaceholder": "Who does it",
  "execution.descriptionPlaceholder": "What to do",
  "execution.add": "Add task",
  "execution.noProblems": "No problems — the execution order holds.",

  "candidates.reviewMine": "Review mine:",

  "chains.eyebrow": "DECIDE",
  "chains.title": "Decision chains",
  "chains.subtitle": "One chain per subject: the decision, the discussion around it, and the follow-up decisions. Submit to the supervisor when it is mature.",
  "chains.pickDecision": "Pick a decision to start a chain",
  "chains.new": "New chain",
  "chains.none": "No chains yet — confirm a decision first, then start its chain here.",
  "chains.loadFailed": "Failed to load chains",
  "chains.back": "Back",
  "chains.submit": "Submit to supervisor",
  "chains.statusDraft": "In discussion",
  "chains.statusPending": "Submitted",
  "chains.status.APPROVED": "Approved",
  "chains.status.REJECTED": "Rejected",
  "chains.status.HELD": "Held",
  "chains.nodeIndex": "Decision {index}",
  "chains.nodeCount": "{count} decision(s)",
  "chains.commentCount": "{count} comment(s)",
  "chains.submittedAt": "submitted {date}",
  "chains.commentAuthor": "Your name",
  "chains.commentPlaceholder": "Discuss here — questions and objections alike",
  "chains.send": "Send",
  "chains.appendNode": "NEXT DECISION",
  "chains.nodeTitlePlaceholder": "New decision (a follow-up or a reversal)",
  "chains.nodeRationalePlaceholder": "Why",
  "chains.nodeMakerPlaceholder": "Decided by (optional)",
  "chains.append": "Append node",
  "chains.approvedNoAppend": "The supervisor approved this chain — no further decisions can be added.",

  "plan.waitingOn": "Waiting on {names}",
  "plan.blockedBy": "Blocked by {names}",

  "plan.selectStatus": "Select status",
  "plan.changeStatus": "Change status",
  "plan.updateStatus": "Update Status",
  "plan.statusOpen": "Open",
  "plan.statusInProgress": "In Progress",
  "plan.statusDelayed": "Delayed",
  "plan.statusBlocked": "Blocked",
  "plan.statusCompleted": "Completed",

  "dependencies.graphAria": "Dependency graph",

  "intake.eyebrow": "DECIDE",
  "intake.title": "Intake & review",
  "intake.subtitle": "AI proposes candidates from meeting notes; you decide what becomes an authoritative record.",
  "intake.discussionsEyebrow": "DISCUSSIONS",
  "intake.importTitle": "Import a discussion",
  "intake.titlePlaceholder": "Discussion title (e.g. Week 2 sync)",
  "intake.contentPlaceholder": "Paste the meeting notes here, or drag a file anywhere onto this card...",
  "intake.importFile": "Import file",
  "intake.importing": "Importing…",
  "intake.formats": ".txt / .md / .docx / .pdf — imported files are saved and extracted in one step",
  "intake.saveDiscussion": "Save discussion",
  "intake.noDiscussions": "No discussions recorded yet.",
  "intake.discussion": "Discussion #{id}",
  "intake.extract": "Extract candidates",
  "intake.extracting": "Extracting…",

  "intake.importError": "Please import a .txt, .md, .docx or .pdf file.",
  "intake.fileTooLarge": "File is larger than 5 MB; split the notes and import again.",
  "intake.importFailed": "Could not import {name}.",
  "intake.failedCreate": "Failed to create discussion",
  "intake.imported": "Imported {name} ({encoding}) — extracting…",

  "intake.importedOnly": "Imported {name} ({encoding}).",
  "intake.alreadyExisted": " · {count} already existed",
  "intake.extractionFailed": "Extraction failed",

  "intake.nothingNewOne": "Nothing new — that candidate already exists for discussion #{id}",
  "intake.nothingNewMany": "Nothing new — all {count} candidates already exist for discussion #{id}",
  "intake.noCandidates": "No candidates found. Extraction needs sentences like \"Bob will ship the API by 2026-11-20.\"",
  "intake.discussionsLabel": "Discussions",

  "candidates.eyebrow": "AI CANDIDATES",
  "candidates.title": "Human review",
  "candidates.pending": "Pending review ({count})",
  "candidates.reviewed": "Reviewed ({count})",
  "candidates.pendingLabel": "Pending candidates",
  "candidates.reviewedLabel": "Reviewed candidates",
  "candidates.none": "No candidates yet. Save a discussion above and run extraction.",

  "candidates.duplicateBadge": "Possible duplicate: {ref}",
  "candidates.fromDiscussion": "from discussion #{id}",
  "candidates.reviewNote": "Review note: {note}",

  "candidates.failedSave": "Failed to save candidate",
  "candidates.failedConfirm": "Failed to confirm candidate",

  "candidates.failedReject": "Failed to reject candidate",

  "candidates.whyReject": "Why reject?",

  "candidates.type.DECISION": "DECISION",
  "candidates.type.COMMITMENT": "COMMITMENT",
  "candidates.type.DEPENDENCY": "DEPENDENCY",
  "candidates.type.ARGUMENT": "ARGUMENT",

};
