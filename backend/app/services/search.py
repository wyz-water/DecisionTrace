"""Pure helpers for the search endpoint.

Matching is a plain AND-of-terms across a row's searchable fields: every
term must appear somewhere in the row, each field contributes one point to
the relevance score, and the snippet is a window around the first hit in
the first matched field. No SQL, no state — the route decides which rows
to visit, these functions only score and trim them.
"""

import re

SNIPPET_RADIUS = 60


def parse_terms(query: str):
    """Split a raw query into its search terms."""
    return [term for term in (query or "").split() if term]


def escape_like(term: str) -> str:
    """Escape LIKE wildcards so user input is always literal."""
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def like_pattern(term: str) -> str:
    return f"%{escape_like(term)}%"


def match_fields(terms, fields):
    """Score one row against its searchable fields.

    Returns ``(score, matched_names)`` where score is the number of
    distinct fields hit, or ``(0, [])`` when any term is missing from the
    whole row. Comparison is case-insensitive.
    """
    lowered_terms = [term.lower() for term in terms]
    fields = [(name, (value or "")) for name, value in fields]

    score = 0
    matched = []

    for name, value in fields:
        haystack = value.lower()

        if all(term in haystack for term in lowered_terms):
            score += 1
            matched.append(name)

    return score, matched


def make_snippet(text: str, terms):
    """A short window around the first occurrence of the first term."""
    text = (text or "").strip()

    if not text or not terms:
        return text[: 2 * SNIPPET_RADIUS]

    hit = None
    lowered = text.lower()
    lowered_terms = [term.lower() for term in terms]

    for term in lowered_terms:
        index = lowered.find(term)

        if index >= 0 and (hit is None or index < hit):
            hit = index

    if hit is None:
        return text[: 2 * SNIPPET_RADIUS]

    start = max(0, hit - SNIPPET_RADIUS)
    end = min(len(text), hit + SNIPPET_RADIUS + len(terms[0]))

    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""

    return f"{prefix}{text[start:end]}{suffix}"


def highlight_term(snippet: str, term: str) -> str:
    """Wrap the first occurrence of ``term`` in ``<mark>`` for the UI.

    The frontend renders the snippet with dangerouslySetInnerHTML only for
    this escaped, server-built fragment; the search terms come from the
    same request, so the only HTML in it is the mark element we add here.
    """
    escaped = (
        snippet.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    )
    term_escaped = re.escape(term)

    return re.sub(
        term_escaped,
        lambda m: f"<mark>{m.group(0)}</mark>",
        escaped,
        count=1,
        flags=re.IGNORECASE,
    )
