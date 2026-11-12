from datetime import timezone

"""Retrospective metrics: the "reflect" step of the agent loop.

Everything is computed from the append-only history tables and the
arguments — nothing is stored, so the numbers can never go stale (the
same principle as A8, applied to reflection). Plain meeting minutes
cannot produce these: they are properties of the decision *process*,
not of any single record.
"""

SECONDS_PER_DAY = 86400


def _as_utc(value):
    """Normalize a possibly-naive datetime to UTC.

    Rows written by older code or a manual migration may carry naive
    timestamps; mixing naive and aware values would crash the
    subtraction, so treat naive as UTC here.
    """
    if value is None or value.tzinfo is not None:
        return value

    return value.replace(tzinfo=timezone.utc)


def build_health_payload(decisions, decision_histories, arguments):
    """Decision health metrics from raw rows.

    decisions: list[Decision]
    decision_histories: list[DecisionHistory] (all rows of the project)
    arguments: list[Argument]
    """
    total = len(decisions)

    overturned = [
        decision
        for decision in decisions
        if decision.status in {"SUPERSEDED", "REVOKED"}
    ]

    # Lifespan of an overturned decision: created_at -> the first history
    # row that flipped its status to SUPERSEDED/REVOKED.
    lifespan_days = []

    for decision in overturned:
        rows = sorted(
            (
                row
                for row in decision_histories
                if row.decision_id == decision.id
            ),
            key=lambda row: row.changed_at,
        )

        for row in rows:
            if row.new_status not in {"SUPERSEDED", "REVOKED"}:
                continue

            if decision.created_at is not None and row.changed_at is not None:
                days = (
                    _as_utc(row.changed_at) - _as_utc(decision.created_at)
                ).total_seconds() / SECONDS_PER_DAY
                lifespan_days.append(round(days, 1))

            break

    revised = {
        row.decision_id
        for row in decision_histories
        if row.decision_id is not None
    }

    open_objections = [
        argument
        for argument in arguments
        if argument.stance == "AGAINST" and argument.status == "OPEN"
    ]

    resolved_objections = [
        argument
        for argument in arguments
        if argument.stance == "AGAINST" and argument.status == "RESOLVED"
    ]

    # A decision counts once however many open objections it carries.
    contested_ids = {
        argument.decision_id
        for argument in open_objections
        if argument.decision_id is not None
    }

    objections_total = len(open_objections) + len(resolved_objections)

    def rate(part, whole):
        """Fraction rounded to 3 decimals, or None when undefined."""
        return round(part / whole, 3) if whole else None

    return {
        "decisions_total": total,
        "overturned_count": len(overturned),
        "overturn_rate": rate(len(overturned), total),
        "avg_overturn_lifespan_days": (
            round(sum(lifespan_days) / len(lifespan_days), 1)
            if lifespan_days
            else None
        ),
        "revised_count": len(revised),
        "revision_rate": rate(len(revised), total),
        "contested_count": len(contested_ids),
        "contested_rate": rate(len(contested_ids), total),
        "open_objections": len(open_objections),
        "resolved_objections": len(resolved_objections),
        "objection_resolution_rate": rate(
            len(resolved_objections), objections_total
        ),
    }
