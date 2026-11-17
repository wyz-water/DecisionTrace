"""Scoring harness for the Part III evaluation (architecture §10).

Pure functions over plain dicts — the gold set and pipeline outputs are
JSON, nothing here touches the database. Deterministic and unit-tested,
so the blind rules-vs-LLM runner can reuse it and every report comes
from the same arithmetic.

Terminology (per entity type):

- *match*: a predicted entity aligned to a gold entity (span first,
  then identity fields) — true positive;
- *false positive*: a predicted entity with no gold counterpart;
- *missed*: a gold entity with no predicted counterpart — the worst
  failure, because no human ever sees it;
- *hallucinated*: a false positive whose source span does not occur in
  the discussion text at all;
- *wrong type*: the span exists in gold, but under another entity type.

Every failure also lands in the error taxonomy, so each fix targets the
dominant category (architecture §10).
"""

ENTITY_FIELDS = {
    "DECISION": ("title", "rationale"),
    "COMMITMENT": (
        "owner", "description", "due_date", "decision_title",
    ),
    "DEPENDENCY": (
        "predecessor_owner", "successor_owner", "dependency_type",
    ),
    "ARGUMENT": ("stance", "claim", "author", "target_title"),
}

# The display name of an entity, used by coverage/faithfulness checks.
DISPLAY_NAME_FIELD = {
    "DECISION": "title",
    "COMMITMENT": "description",
    "DEPENDENCY": None,  # represented as "A -> B", see _display_name
    "ARGUMENT": "claim",
}


def _norm(value):
    """Whitespace- and case-insensitive text comparison."""
    return " ".join(str(value or "").split()).strip().lower()


def _span_ratio(first, second):
    """len(intersection) / len(shorter span), for fuzzy matching."""
    first = _norm(first)
    second = _norm(second)

    if not first or not second:
        return 0.0

    shorter, longer = sorted((first, second), key=len)
    best = 0

    for size in range(len(shorter), 0, -1):
        if size <= best:
            break

        for start in range(0, len(shorter) - size + 1):
            if shorter[start:start + size] in longer:
                best = size
                break

    return best / len(shorter) if shorter else 0.0


def _identity_match(gold, predicted, entity_type):
    """All identity fields equal (None == missing, case-insensitive)."""
    for field in ENTITY_FIELDS.get(entity_type, ()):
        gold_value = _norm(gold.get("fields", {}).get(field))
        predicted_value = _norm(predicted.get("fields", {}).get(field))

        if gold_value != predicted_value:
            return False

    return True


def _align_by_type(gold_entities, predicted_entities, entity_type):
    """Greedy one-to-one alignment of predicted entities onto gold ones.

    Priority: same span, then overlapping span, then identical identity
    fields. Returns (matches, unmatched_gold, unmatched_predicted).
    """
    gold = [e for e in gold_entities if e.get("type") == entity_type]
    predicted = [e for e in predicted_entities if e.get("type") == entity_type]

    unmatched_gold = list(gold)
    unmatched_predicted = list(predicted)
    matches = []

    def take(gold_item, predicted_item):
        unmatched_gold.remove(gold_item)
        unmatched_predicted.remove(predicted_item)
        matches.append((gold_item, predicted_item))

    # Pass 1: identical normalized spans.
    for predicted_item in list(unmatched_predicted):
        for gold_item in list(unmatched_gold):
            if _norm(gold_item.get("span")) == _norm(predicted_item.get("span")):
                take(gold_item, predicted_item)
                break

    # Pass 2: overlapping spans (>= 50% of the shorter).
    for predicted_item in list(unmatched_predicted):
        for gold_item in list(unmatched_gold):
            if _span_ratio(gold_item.get("span"), predicted_item.get("span")) >= 0.5:
                take(gold_item, predicted_item)
                break

    # Pass 3: identical identity fields (source spans lost or differing).
    for predicted_item in list(unmatched_predicted):
        for gold_item in list(unmatched_gold):
            if _identity_match(gold_item, predicted_item, entity_type):
                take(gold_item, predicted_item)
                break

    return matches, unmatched_gold, unmatched_predicted


def score_type(gold_entities, predicted_entities, entity_type,
               discussion_text=None):
    """Precision/recall/F1 for one entity type, plus the error taxonomy.

    discussion_text (optional) lets hallucinated false positives be told
    apart from plain ones: a span that does not occur in the text at
    all is a hallucination, the most serious extraction failure.
    """
    matches, unmatched_gold, unmatched_predicted = _align_by_type(
        gold_entities, predicted_entities, entity_type
    )

    true_positives = len(matches)
    false_positives = len(unmatched_predicted)
    false_negatives = len(unmatched_gold)

    taxonomy = {}

    # Field-level errors on matched entities.
    field_errors = {}

    for gold_item, predicted_item in matches:
        for field in ENTITY_FIELDS.get(entity_type, ()):
            if _norm(gold_item.get("fields", {}).get(field)) != _norm(
                predicted_item.get("fields", {}).get(field)
            ):
                key = f"wrong_field:{field}"
                field_errors[key] = field_errors.get(key, 0) + 1

    taxonomy.update(field_errors)

    if false_negatives:
        taxonomy["missed_entity"] = false_negatives

    text = _norm(discussion_text)

    for item in unmatched_predicted:
        span = _norm(item.get("span"))

        if span and text and span not in text:
            taxonomy["hallucinated"] = taxonomy.get("hallucinated", 0) + 1
        else:
            taxonomy["false_positive"] = taxonomy.get("false_positive", 0) + 1

    precision = (
        round(true_positives / (true_positives + false_positives), 3)
        if true_positives + false_positives
        else None
    )
    recall = (
        round(true_positives / (true_positives + false_negatives), 3)
        if true_positives + false_negatives
        else None
    )

    f1 = None

    if precision is not None and recall is not None and precision + recall:
        f1 = round(2 * precision * recall / (precision + recall), 3)

    return {
        "entity_type": entity_type,
        "true_positives": true_positives,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "taxonomy": taxonomy,
        "field_errors": field_errors,
    }


def wrong_type_count(gold_entities, predicted_entities, discussion_text=None):
    """Predicted entities whose span sits in gold under another type."""
    wrong = 0
    text = _norm(discussion_text)

    for predicted_item in predicted_entities:
        predicted_span = _norm(predicted_item.get("span"))
        predicted_type = predicted_item.get("type")

        for gold_item in gold_entities:
            if gold_item.get("type") == predicted_type:
                continue

            if predicted_span and _norm(gold_item.get("span")) == predicted_span:
                wrong += 1
                break

        # A span absent from the text cannot be typed wrongly.
        if predicted_span and text and predicted_span not in text:
            continue

    return wrong


def score_all(gold_entities, predicted_entities, discussion_text=None):
    """Per-type scores plus the wrong-type count."""
    types = sorted({e.get("type") for e in gold_entities + predicted_entities})

    return {
        "per_type": {
            entity_type: score_type(
                gold_entities,
                predicted_entities,
                entity_type,
                discussion_text,
            )
            for entity_type in types
        },
        "wrong_type": wrong_type_count(
            gold_entities, predicted_entities, discussion_text
        ),
    }


def _display_name(entity):
    entity_type = entity.get("type")
    field = DISPLAY_NAME_FIELD.get(entity_type)

    if field:
        return _norm(entity.get("fields", {}).get(field))

    if entity_type == "DEPENDENCY":
        fields = entity.get("fields", {})
        predecessor = _norm(fields.get("predecessor_owner"))
        successor = _norm(fields.get("successor_owner"))

        if predecessor and successor:
            return f"{predecessor} -> {successor}"

    return None


def summary_coverage(gold_entities, summary_names):
    """Fraction of gold entities whose display name appears in the
    summary's name list (cheap proxy; the gold-set protocol is the
    authoritative measure, architecture §10)."""
    names = {_norm(name) for name in (summary_names or [])}
    covered = 0
    total = 0

    for entity in gold_entities:
        name = _display_name(entity)

        if not name:
            continue

        total += 1

        if name in names or any(name in existing for existing in names):
            covered += 1

    return {
        "covered": covered,
        "total": total,
        "coverage": round(covered / total, 3) if total else None,
    }


def summary_faithfulness(summary_names, discussion_text):
    """Fraction of summary names that occur in the discussion text —
    nothing in the summary may lack support (proxy for the human
    faithfulness check)."""
    text = _norm(discussion_text)
    faithful = 0
    total = 0

    for name in summary_names or []:
        normalized = _norm(name)

        if not normalized:
            continue

        total += 1

        if normalized in text:
            faithful += 1

    return {
        "faithful": faithful,
        "total": total,
        "faithfulness": round(faithful / total, 3) if total else None,
    }


def snapshot_agreement(gold_nodes, gold_edges, snapshot_nodes, snapshot_edges):
    """Node/edge agreement between the gold graph and a saved snapshot
    (target: >= 80%, architecture §10)."""
    gold_node_ids = {_norm(node) for node in (gold_nodes or [])}
    snapshot_node_ids = {_norm(node) for node in (snapshot_nodes or [])}

    gold_edge_ids = {(_norm(a), _norm(b)) for a, b in (gold_edges or [])}
    snapshot_edge_ids = {
        (_norm(a), _norm(b)) for a, b in (snapshot_edges or [])
    }

    def agreement(gold_set, snapshot_set):
        intersection = len(gold_set & snapshot_set)
        union = len(gold_set | snapshot_set)

        return {
            "agreed": intersection,
            "gold_total": len(gold_set),
            "snapshot_total": len(snapshot_set),
            "agreement": round(intersection / union, 3) if union else None,
        }

    return {
        "nodes": agreement(gold_node_ids, snapshot_node_ids),
        "edges": agreement(gold_edge_ids, snapshot_edge_ids),
    }


def inter_annotator_agreement(entities_a, entities_b):
    """Agreement between two independent annotations.

    Items are clustered by (type, normalized span); callers tag each
    entity with ``_annotator`` ("A"/"B"). For each cluster: presence in
    A / presence in B feed the 2x2 table for Cohen's kappa; for
    clusters both annotated, per-field simple agreement is reported.

    Limitation, stated honestly in the protocol doc: clusters only
    exist where at least one annotator saw an entity, so this kappa
    measures agreement over *detected* items — it cannot see spans both
    annotators agree are empty. The full protocol complements it with
    per-field agreement and the frozen-gold-set workflow.
    """
    def cluster_key(entity):
        return (entity.get("type"), _norm(entity.get("span")))

    clusters = {}

    for entity in entities_a + entities_b:
        key = cluster_key(entity)

        if key not in clusters:
            clusters[key] = []

        clusters[key].append(entity)

    both = 0
    only_a = 0
    only_b = 0
    field_agreements = {}
    field_totals = {}

    for key, items in clusters.items():
        from_a = [e for e in items if e.get("_annotator") == "A"]
        from_b = [e for e in items if e.get("_annotator") == "B"]

        if from_a and from_b:
            both += 1

            gold_item, predicted_item = from_a[0], from_b[0]

            for field in ENTITY_FIELDS.get(key[0], ()):
                field_totals[field] = field_totals.get(field, 0) + 1

                if _norm(gold_item.get("fields", {}).get(field)) == _norm(
                    predicted_item.get("fields", {}).get(field)
                ):
                    field_agreements[field] = field_agreements.get(field, 0) + 1
        elif from_a:
            only_a += 1
        else:
            only_b += 1

    total = both + only_a + only_b
    observed = both / total if total else 0.0
    p_a = (both + only_a) / total if total else 0.0
    p_b = (both + only_b) / total if total else 0.0
    expected = p_a * p_b + (1 - p_a) * (1 - p_b)

    if expected == 1.0:
        # Both annotators always annotate (or never do): agreement with
        # no expected variation. Conventional edge case: full agreement
        # -> 1.0, none -> 0.0.
        kappa = 1.0 if observed == 1.0 else 0.0
    else:
        kappa = round((observed - expected) / (1 - expected), 3)

    return {
        "both": both,
        "only_a": only_a,
        "only_b": only_b,
        "total_clusters": total,
        "cohens_kappa": kappa,
        "field_agreement": {
            field: round(field_agreements.get(field, 0) / field_totals[field], 3)
            if field_totals.get(field)
            else None
            for field in field_totals
        },
    }


def verification_rates(candidates):
    """Confirmation and rejection rates over reviewed candidates.

    Edit rate (confirmed with payload changes) cannot be derived from
    status alone; the pilot measures it by diffing the candidate payload
    against the created record, so it is reported separately.
    """
    total = len(candidates)

    if not total:
        return {
            "total": 0,
            "confirmed_rate": None,
            "rejected_rate": None,
            "edit_rate": None,
        }

    confirmed = sum(1 for c in candidates if c.get("status") == "CONFIRMED")
    rejected = sum(1 for c in candidates if c.get("status") == "REJECTED")

    return {
        "total": total,
        "confirmed_rate": round(confirmed / total, 3),
        "rejected_rate": round(rejected / total, 3),
        "edit_rate": None,  # payload diff, measured in the pilot
    }
