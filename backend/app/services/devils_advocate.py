"""The devil's advocate: drafted challenges before a decision lands.

A ledger records what the team said; an analyst also surfaces what the
team did *not* address. Before a decision candidate is confirmed, the
system drafts counter-considerations from three honest sources:

- objections already in the queue that target this decision (the team
  said it, nobody has resolved it yet);
- concern sentences in the source discussion that the extractor did not
  capture as arguments (a worry nobody framed as an objection);
- an overturned precedent: a similar past decision that did not hold.

Challenges are computed on read, like cycles and contested (A8/A13):
nothing is stored until confirmation, when the human's resolution of
each challenge is recorded as a resolved AGAINST argument on the new
decision — so the audit trail keeps what was challenged and why it was
overruled. Drafts never invent facts: every text-based challenge quotes
the sentence it came from, and every precedent names the decision.
"""

import json
import re

from app.models.argument import Argument
from app.models.candidate import Candidate
from app.models.decision import Decision
from app.models.decision_history import DecisionHistory
from app.models.discussion import Discussion
from app.services.extractor import SENTENCE_SPLIT
from app.services.retrospective import _as_utc

# Sentences that carry a concern but were not extracted as arguments.
# Conservative on purpose: a false positive costs one resolution reason
# on a draft the human can dismiss; a false negative costs a blind spot.
RISK_KEYWORDS_EN = (
    "risk", "concern", "worr", "problem", "expensive", "slow",
    "complex", "fail", "rollback", "doubt", "danger", "cost",
)

RISK_KEYWORDS_CN = (
    "风险", "担心", "顾虑", "问题", "太贵", "太慢", "复杂",
    "失败", "回滚", "成本", "不可行", "困难",
)

CJK_RUN = re.compile(r"[一-龥]+")
EN_TOKEN = re.compile(r"[a-z0-9]+")

# Below this length a sentence is not a concern, it is a phrase.
MIN_CONCERN_LENGTH = 12
# Above this length a sentence is a paragraph, not a point a human can
# resolve with one reason.
MAX_CONCERN_LENGTH = 300


def _strip_verb_prefix(title):
    """The same tolerance the duplicate check uses: "Use Redis" ≡
    "Redis". Titles are compared stripped, so a challenge cannot fire
    twice for the same decision stated with or without its verb."""
    lowered = title.strip().lower()

    for prefix in ("use ", "using ", "to "):
        if lowered.startswith(prefix):
            return lowered[len(prefix):]

    return lowered


def titles_equivalent(first, second):
    """Tolerant title equality: same decision under extractor cleaning."""
    return _strip_verb_prefix(first) == _strip_verb_prefix(second)


def _longest_common_cjk(first, second):
    """Length of the longest common CJK substring (0 for non-CJK input).

    EN titles share whole words; CJK titles have no spaces, so a shared
    substring of 3+ characters is the honest signal ("微服务架构" in
    "采用微服务架构" and "停止微服务架构")."""
    first = "".join(CJK_RUN.findall(first))
    second = "".join(CJK_RUN.findall(second))

    if not first or not second:
        return 0

    shorter, longer = sorted((first, second), key=len)
    best = 0

    for size in range(len(shorter), 0, -1):
        if size <= best:
            break

        for start in range(0, len(shorter) - size + 1):
            if shorter[start:start + size] in longer:
                best = size
                break

    return best


def titles_similar(first, second):
    """Similar titles, for the overturned-precedent rule.

    Exact matches (after cleaning) are duplicates, handled by
    duplicate_of — a restatement is not a precedent. Similarity is one
    shared significant EN token (4+ chars, so "use" never matches) or a
    shared CJK substring of 3+ characters.
    """
    first_clean = _strip_verb_prefix(first)
    second_clean = _strip_verb_prefix(second)

    if first_clean == second_clean:
        return False

    first_tokens = {
        token for token in EN_TOKEN.findall(first_clean) if len(token) >= 4
    }
    second_tokens = {
        token for token in EN_TOKEN.findall(second_clean) if len(token) >= 4
    }

    if first_tokens & second_tokens:
        return True

    return _longest_common_cjk(first_clean, second_clean) >= 3


def _is_concern_sentence(sentence):
    """A sentence carrying a concern keyword in either language."""
    lowered = sentence.lower()

    if any(keyword in lowered for keyword in RISK_KEYWORDS_EN):
        return True

    return any(keyword in sentence for keyword in RISK_KEYWORDS_CN)


def _overturned_precedents(db, project_id, title):
    """SUPERSEDED/REVOKED decisions whose title is similar to this one,
    with their lifespan in days (created_at -> the flip row)."""
    rows = db.query(Decision).filter(
        Decision.project_id == project_id,
        Decision.status.in_(["SUPERSEDED", "REVOKED"]),
    ).all()

    precedents = []

    for row in rows:
        if not titles_similar(row.title, title):
            continue

        lifespan = None

        flip = (
            db.query(DecisionHistory)
            .filter(
                DecisionHistory.decision_id == row.id,
                DecisionHistory.new_status.in_(["SUPERSEDED", "REVOKED"]),
            )
            .order_by(DecisionHistory.changed_at.asc())
            .first()
        )

        if flip and row.created_at is not None and flip.changed_at is not None:
            lifespan = round(
                (_as_utc(flip.changed_at) - _as_utc(row.created_at))
                .total_seconds() / 86400,
                1,
            )

        precedents.append({"decision": row, "lifespan_days": lifespan})

    return precedents


def draft_challenges(db, candidate):
    """Draft the devil's advocate list for a pending DECISION candidate.

    Returns a list of challenge dicts; each has a stable id (kind plus
    index within this computation), the human-facing claim, the source
    sentence when the challenge quotes the discussion, and a citation.
    Non-decision candidates have no challenges: the gate is about
    decisions.
    """
    if candidate.candidate_type != "DECISION":
        return []

    payload = json.loads(candidate.payload)

    if not isinstance(payload, dict):
        return []

    title = str(payload.get("title") or "").strip()
    if not title:
        return []

    challenges = []

    # 1. Objections already extracted but still pending, targeting this
    # decision. The sentence names the decision tolerantly ("using
    # Redis" vs "Redis"), matching the confirm-time linking rule.
    pending_objections = db.query(Candidate).filter(
        Candidate.discussion_id == candidate.discussion_id,
        Candidate.candidate_type == "ARGUMENT",
        Candidate.status == "PENDING",
    ).all()

    for row in pending_objections:
        row_payload = json.loads(row.payload)

        if not isinstance(row_payload, dict):
            continue

        stance = str(row_payload.get("stance") or "").upper()
        target_title = str(row_payload.get("target_title") or "").strip()

        if stance != "AGAINST" or not target_title:
            continue

        if not titles_equivalent(target_title, title):
            continue

        claim = str(row_payload.get("claim") or "").strip()

        if not claim:
            continue

        challenges.append({
            "id": f"unresolved_objection:{row.id}",
            "kind": "unresolved_objection",
            "claim": claim,
            "source_text": row.source_text,
            "citation": f"candidate #{row.id}",
        })

    # 2. Concern sentences the extractor missed: they carry a concern
    # keyword but are not the source of any candidate in the discussion.
    if candidate.discussion_id is not None:
        source = db.query(Discussion).filter(
            Discussion.id == candidate.discussion_id
        ).first()

        if source is not None:
            captured = {
                " ".join((row.source_text or "").split())
                for row in db.query(Candidate).filter(
                    Candidate.discussion_id == candidate.discussion_id
                ).all()
                if row.source_text
            }

            for sentence in SENTENCE_SPLIT.split(source.content):
                sentence = sentence.strip()

                if not sentence:
                    continue

                if not MIN_CONCERN_LENGTH <= len(sentence) <= MAX_CONCERN_LENGTH:
                    continue

                if " ".join(sentence.split()) in captured:
                    continue

                if not _is_concern_sentence(sentence):
                    continue

                challenges.append({
                    "id": f"silent_concern:{len(challenges)}",
                    "kind": "silent_concern",
                    "claim": sentence,
                    "source_text": sentence,
                    "citation": f"discussion #{candidate.discussion_id}",
                })

    # 3. An overturned precedent: a similar decision that did not hold.
    for precedent in _overturned_precedents(
        db, candidate.project_id, title
    ):
        row = precedent["decision"]

        lifespan = precedent["lifespan_days"]
        how_long = (
            f" after {lifespan} day(s)" if lifespan is not None else ""
        )

        challenges.append({
            "id": f"overturned_precedent:{row.id}",
            "kind": "overturned_precedent",
            "claim": (
                f"A similar decision was overturned{how_long}: "
                f"'{row.title}'. What is different this time?"
            ),
            "source_text": None,
            "citation": f"decision #{row.id}",
        })

    # 4. No recorded goal: manual creation refuses this, but extracted
    # candidates can arrive without a rationale.
    if not str(payload.get("rationale") or "").strip():
        challenges.append({
            "id": "missing_rationale",
            "kind": "missing_rationale",
            "claim": "This decision records no rationale or goal.",
            "source_text": None,
            "citation": None,
        })

    return challenges


def record_resolutions(db, decision, challenges, resolutions):
    """Persist the human's resolution of each draft as a resolved
    AGAINST argument on the new decision.

    Returns the number of argument rows created. The resolved_reason is
    mandatory by construction (the route rejects empty reasons before
    calling this), so the challenge can never vanish silently.
    """
    by_id = {challenge["id"]: challenge for challenge in challenges}

    created = 0

    for item in resolutions:
        # Resolutions arrive as pydantic models from the route, but this
        # service stays testable with plain dicts.
        if isinstance(item, dict):
            challenge_id = item.get("challenge_id")
            resolved_reason = item.get("resolved_reason")
        else:
            challenge_id = getattr(item, "challenge_id", None)
            resolved_reason = getattr(item, "resolved_reason", None)

        challenge = by_id.get(challenge_id)

        if challenge is None or not (resolved_reason or "").strip():
            continue

        argument = Argument(
            project_id=decision.project_id,
            discussion_id=decision.source_discussion_id,
            decision_id=decision.id,
            stance="AGAINST",
            claim=challenge["claim"],
            source_text=challenge["source_text"],
            status="RESOLVED",
            resolved_reason=resolved_reason.strip(),
        )

        db.add(argument)
        created += 1

    return created
