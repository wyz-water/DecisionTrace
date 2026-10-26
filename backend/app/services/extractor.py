"""Extract candidate project records from discussion text.

Two backends:

- Rule-based extraction (default): regex patterns over sentences.
- LLM extraction: used when the DEEPSEEK_API_KEY environment variable
  is set, with automatic fallback to rules on any failure.

Extraction output is always a *candidate*, never an authoritative
record. Humans review and confirm it.
"""

import json
import os
import re
import urllib.request

from app.schemas.candidate import CandidateResponse


# Owner names that are pronouns / noise, not people.
NOT_OWNERS = {
    "We", "The", "Our", "Their", "They", "This", "That", "It",
    "I", "You", "He", "She", "If", "In", "On", "As", "But", "And",
}

DECISION_PATTERNS = [
    re.compile(
        r"(?:we|the team|our team)\s+(?:decided|agreed|chose)\s+"
        r"(?:to\s+|on\s+)?(?P<title>[^.,;!?]+?)"
        r"(?:\s+because\s+(?P<rationale>[^.,;!?]+?))?[.,;!?]?\s*$",
        re.IGNORECASE,
    ),
    re.compile(
        r"(?:we|the team|our team)\s+(?:will|are going to|plan to)\s+"
        r"use\s+(?P<title>[^.,;!?]+?)"
        r"(?:\s+because\s+(?P<rationale>[^.,;!?]+?))?[.,;!?]?\s*$",
        re.IGNORECASE,
    ),
]

COMMITMENT_PATTERN = re.compile(
    r"(?P<owner>[A-Z][a-z]+)\s+"
    r"(?:will|is going to|commits? to|agrees to|needs to|must)\s+"
    r"(?P<description>[^.,;!?]+?)"
    r"(?:\s+by\s+(?P<due>[^.,;!?]+))?[.,;!?]?\s*$",
)

DEPENDENCY_PATTERNS = [
    # "Bob depends on / is blocked by / needs Carol"
    re.compile(
        r"(?P<owner>[A-Z][a-z]+)[^.,;!?]*?\b"
        r"(?:depends on|is blocked by|needs|waits for|waiting for)\s+"
        r"(?P<other>[A-Z][a-z]+)",
        re.IGNORECASE,
    ),
    # "Carol blocks / must finish before Bob"
    re.compile(
        r"(?P<other>[A-Z][a-z]+)\s+"
        r"(?:blocks|must finish before|needs to finish before)\s+"
        r"(?P<owner>[A-Z][a-z]+)",
        re.IGNORECASE,
    ),
    # "Bob ... after Carol finishes / is done"
    re.compile(
        r"(?P<owner>[A-Z][a-z]+)[^.,;!?]*?\bafter\s+"
        r"(?P<other>[A-Z][a-z]+)\s+"
        r"(?:finishes|is done|completes|delivers)",
        re.IGNORECASE,
    ),
]

SENTENCE_SPLIT = re.compile(r"[.;!?\n]+")


def _clean_title(value):
    value = value.strip()
    for prefix in ("use ", "using ", "to "):
        if value.lower().startswith(prefix):
            value = value[len(prefix):]
            break
    return value.strip()


def _parse_due_date(value):
    """Keep only ISO dates; natural-language dates need human review."""
    if not value:
        return None

    value = value.strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return value

    return None


def rule_based_extract(text):
    """Apply sentence-level patterns and return candidate dicts."""
    candidates = []

    for sentence in SENTENCE_SPLIT.split(text):
        sentence = sentence.strip()
        if not sentence:
            continue

        for pattern in DECISION_PATTERNS:
            match = pattern.search(sentence)

            if not match:
                continue

            title = _clean_title(match.group("title"))
            rationale = (
                match.group("rationale").strip()
                if match.group("rationale")
                else None
            )

            if title:
                candidates.append({
                    "candidate_type": "DECISION",
                    "payload": {
                        "title": title,
                        "rationale": rationale,
                        "status": "CONFIRMED",
                    },
                    "source_text": sentence,
                })

            break

        match = COMMITMENT_PATTERN.search(sentence)

        if match:
            owner = match.group("owner")
            if owner not in NOT_OWNERS:
                candidates.append({
                    "candidate_type": "COMMITMENT",
                    "payload": {
                        "owner": owner,
                        "description": match.group("description").strip(),
                        "due_date": _parse_due_date(match.group("due")),
                        "status": "OPEN",
                        "decision_title": None,
                    },
                    "source_text": sentence,
                })

        for pattern in DEPENDENCY_PATTERNS:
            match = pattern.search(sentence)

            if not match:
                continue

            owner = match.group("owner")
            other = match.group("other")

            # Patterns are case-insensitive, so lowercase pronouns can
            # match; normalize before checking the stop list.
            if owner.title() in NOT_OWNERS or other.title() in NOT_OWNERS:
                continue

            candidates.append({
                "candidate_type": "DEPENDENCY",
                "payload": {
                    "predecessor_owner": other,
                    "successor_owner": owner,
                    "dependency_type": "BLOCKS",
                },
                "source_text": sentence,
            })

            break

    return candidates


DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"

SYSTEM_PROMPT = (
    "You extract structured project records from a team discussion. "
    'Return ONLY a JSON object with this exact shape: '
    '{"candidates": [{"candidate_type": "DECISION" | "COMMITMENT" | '
    '"DEPENDENCY", "payload": { ... }, "source_text": "..."}]}. '
    "Payload shapes: "
    'DECISION: {"title": str, "rationale": str | null, '
    '"status": "CONFIRMED"}. '
    'COMMITMENT: {"owner": str, "description": str, '
    '"due_date": "YYYY-MM-DD" | null, "status": "OPEN", '
    '"decision_title": str | null}. '
    'DEPENDENCY: {"predecessor_owner": str, "successor_owner": str, '
    '"dependency_type": "BLOCKS"}. '
    "Only extract facts explicitly stated in the text. Do not invent. "
    "source_text must be the exact sentence the candidate came from."
)


def _extract_via_llm(text):
    """Return candidate dicts from DeepSeek, or None when unavailable."""
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        return None

    body = json.dumps({
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        "temperature": 0,
    }).encode("utf-8")

    request = urllib.request.Request(
        DEEPSEEK_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )

    with urllib.request.urlopen(request, timeout=60) as response:
        data = json.loads(response.read().decode("utf-8"))

    content = data["choices"][0]["message"]["content"]

    return json.loads(content).get("candidates")


def extract_candidates(text):
    """Run extraction; LLM first, falling back to rules."""
    try:
        llm_candidates = _extract_via_llm(text)
    except Exception:
        llm_candidates = None

    if llm_candidates is not None:
        candidates = _normalize(llm_candidates)
        if candidates:
            return candidates

    return rule_based_extract(text)


def _normalize(candidates):
    """Keep only well-formed candidates from the LLM response."""
    allowed_types = {"DECISION", "COMMITMENT", "DEPENDENCY"}

    cleaned = []

    for item in candidates:
        if (
            isinstance(item, dict)
            and item.get("candidate_type") in allowed_types
            and isinstance(item.get("payload"), dict)
        ):
            source_text = item.get("source_text")

            cleaned.append({
                "candidate_type": item["candidate_type"],
                "payload": item["payload"],
                "source_text": (
                    source_text if isinstance(source_text, str) else None
                ),
            })

    return cleaned


def serialize_candidate(candidate):
    """Build a CandidateResponse from the model row."""
    return CandidateResponse(
        id=candidate.id,
        project_id=candidate.project_id,
        discussion_id=candidate.discussion_id,
        candidate_type=candidate.candidate_type,
        payload=json.loads(candidate.payload),
        source_text=candidate.source_text,
        status=candidate.status,
        review_comment=candidate.review_comment,
        created_at=candidate.created_at,
    )
