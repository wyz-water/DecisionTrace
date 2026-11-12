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

# Chinese full-width punctuation ends sentences too (。;); the team's
# discussions are mixed-language. The full-width comma splits clauses —
# "但是风险很大,我们不同意这周上线" is two arguments, not one. ASCII
# commas do NOT split, so English extraction behavior is unchanged.
SENTENCE_SPLIT = re.compile(r"[.;!?\n。；，]+")

# Claims too thin to be worth a human's review.
CLAIM_NOISE = {"it", "this", "that"}

# Chinese words that look like a person but are not one.
AUTHOR_NOISE_CN = {
    "我们", "他们", "你们", "大家", "这个", "这些", "那个", "那些",
    "因为", "但是", "不过", "如果", "所以", "而且",
}

# (stance, pattern) pairs. Order matters: the first match wins.
# Target is captured only when the pattern also names the reason, so
# "Bob disagrees with using Redis because it is complex" links the
# argument to the Redis decision while "I disagree" stays free-standing.
ARGUMENT_PATTERNS = [
    # "Bob disagrees with using Redis because it is complex"
    (
        "AGAINST",
        re.compile(
            r"(?P<author>[A-Z][a-z]+)\s+"
            r"(?:disagrees?\s+with|objects?\s+to|opposes?)\s+"
            r"(?P<target>[^.,;!?]+?)\s+because\s+"
            r"(?P<claim>[^.,;!?]+)",
            re.IGNORECASE,
        ),
    ),
    # "Bob disagrees with using Redis" (bare, no reason given)
    (
        "AGAINST",
        re.compile(
            r"(?P<author>[A-Z][a-z]+)\s+"
            r"(?:disagrees?\s+with|objects?\s+to|opposes?)\s+"
            r"(?P<target>[^.,;!?]+)",
            re.IGNORECASE,
        ),
    ),
    # "I disagree with using Redis" / "we are not convinced about the plan"
    (
        "AGAINST",
        re.compile(
            r"(?P<who>I|we)\s+"
            r"(?:disagree|object|am\s+not\s+convinced|are\s+not\s+convinced)"
            r"\s+(?:with|to|about)?\s*(?P<claim>[^.,;!?]+)",
            re.IGNORECASE,
        ),
    ),
    # "I worry that Redis adds complexity" / "we are concerned about the
    # migration"
    (
        "AGAINST",
        re.compile(
            r"(?P<who>I|we)\s+"
            r"(?:worry|am\s+worried|are\s+worried|"
            r"am\s+concerned|are\s+concerned)\s+"
            r"(?:that|about)?\s*(?P<claim>[^.,;!?]+)",
            re.IGNORECASE,
        ),
    ),
    # "the risk is the cost" / "the problem is ..."
    (
        "AGAINST",
        re.compile(
            r"the\s+(?:risk|problem|concern)\s+is\s+"
            r"(?P<claim>[^.,;!?]+)",
            re.IGNORECASE,
        ),
    ),
    # "but ... risk/concern/problem/slow/complex/expensive ..."
    # Conservative: the claim must carry a doubt keyword, so plain
    # "but we also fixed the docs" does not become an argument.
    (
        "AGAINST",
        re.compile(
            r"\bbut\s+(?P<claim>[^.,;!?]*"
            r"(?:risk|concern|worr|problem|slow|complex|expensive|"
            r"doubt|danger|fail)[^.,;!?]*)",
            re.IGNORECASE,
        ),
    ),
    # "Bob agrees with using Redis because it scales"
    (
        "FOR",
        re.compile(
            r"(?P<author>[A-Z][a-z]+)\s+"
            r"(?:agrees?\s+with|supports?|endorses?)\s+"
            r"(?P<target>[^.,;!?]+?)\s+because\s+"
            r"(?P<claim>[^.,;!?]+)",
            re.IGNORECASE,
        ),
    ),
    # "Bob agrees with using Redis" (bare, no reason given)
    (
        "FOR",
        re.compile(
            r"(?P<author>[A-Z][a-z]+)\s+"
            r"(?:agrees?\s+with|supports?|endorses?)\s+"
            r"(?P<target>[^.,;!?]+)",
            re.IGNORECASE,
        ),
    ),
    # "I agree that we should use Redis" / "we prefer the first option"
    (
        "FOR",
        re.compile(
            r"(?P<who>I|we)\s+"
            r"(?:agree|support|prefer)\s+"
            r"(?:that|with|to)?\s*(?P<claim>[^.,;!?]+)",
            re.IGNORECASE,
        ),
    ),
    # 中文:"王芳反对这个方案" / "我不同意使用 Redis"
    (
        "AGAINST",
        re.compile(
            r"(?:(?P<author>[一-龥]{2,3})\s*)?"
            r"(?:我|我们)?\s*(?:不同意|反对|不赞成)\s*"
            r"(?:采用|使用|这个|该|这样)?\s*"
            r"(?P<claim>[^,，。;；!！?？]+)"
        ),
    ),
    # 中文:"王芳担心迁移风险太大" / "我顾虑成本太高"
    (
        "AGAINST",
        re.compile(
            r"(?:(?P<author>[一-龥]{2,3})\s*)?"
            r"(?:我|我们)?\s*(?:担心|担忧|顾虑)\s*"
            r"(?P<claim>[^,，。;；!！?？]+)"
        ),
    ),
    # 中文:"但是迁移风险太大" / "不过成本太高"
    (
        "AGAINST",
        re.compile(
            r"(?:但是|不过|然而)\s*"
            r"(?P<claim>[^,，。;；!！?？]*"
            r"(?:风险|担心|问题|不可行|困难|太慢|复杂|太贵)"
            r"[^,，。;；!！?？]*)"
        ),
    ),
    # 中文:"王芳支持用 Redis" / "我同意先迁移数据"
    (
        "FOR",
        re.compile(
            r"(?:(?P<author>[一-龥]{2,3})\s*)?"
            r"(?:我|我们)?\s*(?:同意|支持|赞成)\s*"
            r"(?:采用|使用)?\s*"
            r"(?P<claim>[^,，。;；!！?？了]+)"
        ),
    ),
]


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

        for stance, pattern in ARGUMENT_PATTERNS:
            match = pattern.search(sentence)

            if not match:
                continue

            # Not every pattern defines every group: read them through
            # groupdict so a missing group is None, not an IndexError.
            groups = match.groupdict()

            # The claim is the reason when the pattern names one;
            # otherwise the object of agreement/disagreement is the claim.
            claim = groups.get("claim") or groups.get("target")
            claim = (claim or "").strip()

            # One-character claims and pronoun claims are pattern noise
            # ("了", "no", "it"), not arguments worth a human's review.
            if len(claim) < 2 or claim.lower() in CLAIM_NOISE:
                continue

            author = groups.get("author")

            if author and author.title() in NOT_OWNERS:
                author = None

            if author and author in AUTHOR_NOISE_CN:
                author = None

            # The target only counts when the sentence also gave the
            # reason: "disagrees with X because Y" links to X, a bare
            # "disagrees with X" stays free-standing.
            target = None
            if groups.get("claim") and groups.get("target"):
                target = groups["target"].strip()

            candidates.append({
                "candidate_type": "ARGUMENT",
                "payload": {
                    "stance": stance,
                    "claim": claim,
                    "author": author,
                    "target_title": target,
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
    '"DEPENDENCY" | "ARGUMENT", "payload": { ... }, '
    '"source_text": "..."}]}. '
    "Payload shapes: "
    'DECISION: {"title": str, "rationale": str | null, '
    '"status": "CONFIRMED"}. '
    'COMMITMENT: {"owner": str, "description": str, '
    '"due_date": "YYYY-MM-DD" | null, "status": "OPEN", '
    '"decision_title": str | null}. '
    'DEPENDENCY: {"predecessor_owner": str, "successor_owner": str, '
    '"dependency_type": "BLOCKS"}. '
    'ARGUMENT: {"stance": "FOR" | "AGAINST", "claim": str, '
    '"author": str | null, "target_title": str | null}. '
    "Only extract facts explicitly stated in the text. Do not invent. "
    "source_text must be the exact sentence the candidate came from."
)


def summarize_discussion(text):
    """Rule-based meeting summary: names and counts per record type.

    Always uses the rule engine — never the LLM — so the summary is
    deterministic, offline and free, and so listing discussions cannot
    trigger API calls. It is a preview of what extraction will find, not
    a second opinion on it.
    """
    items = rule_based_extract(text or "")

    decisions = []
    commitments = []
    dependencies = []
    arguments = []

    for item in items:
        payload = item.get("payload") or {}
        candidate_type = item.get("candidate_type")

        if candidate_type == "DECISION" and payload.get("title"):
            decisions.append(str(payload["title"]))
        elif candidate_type == "COMMITMENT" and payload.get("owner"):
            commitments.append(str(payload["owner"]))
        elif candidate_type == "DEPENDENCY":
            pair = (
                payload.get("predecessor_owner"),
                payload.get("successor_owner"),
            )
            if all(pair):
                dependencies.append(f"{pair[0]} → {pair[1]}")
        elif candidate_type == "ARGUMENT" and payload.get("claim"):
            stance = str(payload.get("stance") or "")
            arguments.append(f"{stance} {payload['claim']}")

    return {
        "decisions": decisions,
        "commitments": commitments,
        "dependencies": dependencies,
        "arguments": arguments,
        "total": (
            len(decisions)
            + len(commitments)
            + len(dependencies)
            + len(arguments)
        ),
    }


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
    allowed_types = {"DECISION", "COMMITMENT", "DEPENDENCY", "ARGUMENT"}

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
