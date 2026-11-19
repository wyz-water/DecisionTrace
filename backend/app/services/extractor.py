"""Extract decision candidates from discussion text.

Two backends:

- Rule-based extraction (default): regex patterns over sentences.
- LLM extraction: used when the DEEPSEEK_API_KEY environment variable
  is set, with automatic fallback to rules on any failure.

Extraction output is always a *candidate*, never an authoritative
record. Humans review and confirm it — per maker, each reviewer
confirms their own decisions.

After the repositioning, extraction produces DECISION candidates only:
commitments and execution tasks come later, from the chain discussion,
after the supervisor approves the chain.
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
    # "Alice decided to use Redis because it scales well" — a named
    # maker, captured as decided_by. Collective verbs ("we decided")
    # never invent a single maker; they stay team decisions.
    re.compile(
        r"(?P<author>[A-Z][a-z]+)\s+"
        r"(?:decided|chose|agreed)\s+"
        r"(?:to\s+|on\s+)?(?P<title>[^.,;!?]+?)"
        r"(?:\s+because\s+(?P<rationale>[^.,;!?]+?))?[.,;!?]?\s*$",
        re.IGNORECASE,
    ),
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
    # 中文:"王芳决定采用 Redis" / "我们决定迁移到云"。Title cleaning
    # strips separable verb prefixes (采用/使用/选择) but keeps verbs
    # that are part of the decision ("迁移到云" stays whole).
    re.compile(
        r"(?:(?P<author>[一-龥]{2,3})\s*)?"
        r"(?:我们|团队)?\s*(?:决定|确定)\s*"
        r"(?P<title>[^,，。;；!！?？]+)",
    ),
]

# Chinese full-width punctuation ends sentences too (。;); the team's
# discussions are mixed-language. The full-width comma splits clauses.
SENTENCE_SPLIT = re.compile(r"[.;!?\n。；，]+")

# Chinese words that look like a person but are not one.
AUTHOR_NOISE_CN = {
    "我们", "他们", "你们", "大家", "这个", "这些", "那个", "那些",
    "因为", "但是", "不过", "如果", "所以", "而且",
}


def _clean_title(value):
    value = value.strip()
    for prefix in ("use ", "using ", "to "):
        if value.lower().startswith(prefix):
            value = value[len(prefix):]
            break
    for prefix in ("采用", "使用", "选择", "换用"):
        if value.startswith(prefix):
            value = value[len(prefix):]
            break
    return value.strip()


def rule_based_extract(text):
    """Apply sentence-level decision patterns and return candidate
    dicts. Every extracted decision carries its maker (decided_by)
    when a named person made it."""
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

            groups = match.groupdict()
            rationale = (
                groups["rationale"].strip()
                if groups.get("rationale")
                else None
            )

            author = groups.get("author")

            if (
                author
                and (author.title() in NOT_OWNERS
                     or author in AUTHOR_NOISE_CN)
            ):
                author = None

            if title:
                candidates.append({
                    "candidate_type": "DECISION",
                    "payload": {
                        "title": title,
                        "rationale": rationale,
                        "decided_by": author,
                        "status": "CONFIRMED",
                    },
                    "source_text": sentence,
                })

            break

    return candidates


DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"

SYSTEM_PROMPT = (
    "You extract structured project records from a team discussion. "
    'Return ONLY a JSON object with this exact shape: '
    '{"candidates": [{"candidate_type": "DECISION", "payload": { ... }, '
    '"source_text": "..."}]}. '
    'Payload shape: {"title": str, "rationale": str | null, '
    '"decided_by": str | null, "status": "CONFIRMED"} — decided_by is '
    "the named person who made the decision; null for a collective "
    '"we decided". '
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
    allowed_types = {"DECISION"}

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
    payload = json.loads(candidate.payload)

    if not isinstance(payload, dict):
        payload = {}

    return CandidateResponse(
        id=candidate.id,
        project_id=candidate.project_id,
        discussion_id=candidate.discussion_id,
        candidate_type=candidate.candidate_type,
        payload=payload,
        source_text=candidate.source_text,
        status=candidate.status,
        review_comment=candidate.review_comment,
        created_at=candidate.created_at,
    )
