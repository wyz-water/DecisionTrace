"""Rules shared by the consistency screen and the dependency form.

Both surfaces have to agree on what a "date inversion" is: the consistency
list is the record of what is wrong, the dependency form is where the user
can still do something about it. Keeping one predicate here stops the two
from drifting apart.
"""


def date_inversion(predecessor, successor):
    """Return (predecessor, successor) when their dates contradict.

    A link means the successor cannot finish before its predecessor does,
    so a successor due earlier than the predecessor can never be honoured.

    Missing dates and already-completed successors are exempt: with no
    date there is nothing to compare, and finished work cannot be "too
    early" any more.
    """
    if not predecessor or not successor:
        return None

    if not predecessor.due_date or not successor.due_date:
        return None

    if successor.status == "COMPLETED":
        return None

    if successor.due_date >= predecessor.due_date:
        return None

    return predecessor, successor
