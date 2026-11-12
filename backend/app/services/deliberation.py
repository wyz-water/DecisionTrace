"""The deliberation layer: computed states over arguments.

"Contested" is computed on read (A13) — never a manual status — so the
state cannot drift from the arguments that justify it, exactly like
cycles and impact (A8).
"""


def contested_decision_ids(arguments):
    """Ids of decisions with at least one OPEN AGAINST argument.

    Arguments without a target decision (free-standing concerns) never
    make anything contested: there is no decision to mark.
    """
    contested = set()

    for argument in arguments:
        if (
            argument.decision_id is not None
            and argument.status == "OPEN"
            and argument.stance == "AGAINST"
        ):
            contested.add(argument.decision_id)

    return contested
