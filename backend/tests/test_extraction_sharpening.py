import unittest
from datetime import date, timedelta

from app.services.extractor import (
    HIGH_CONFIDENCE,
    _resolve_due_date,
    rule_based_extract,
    score_confidence,
)


def by_type(candidates, candidate_type):
    return [
        candidate
        for candidate in candidates
        if candidate["candidate_type"] == candidate_type
    ]


class DueDateResolutionTests(unittest.TestCase):
    """Natural-language due phrases resolve against today; the original
    phrase is preserved even when unresolvable."""

    def test_iso_dates_pass_through(self):
        self.assertEqual(
            _resolve_due_date("2026-12-15"),
            ("2026-12-15", None),
        )

    def test_weekday_resolves_to_the_next_occurrence(self):
        today = date.today()
        iso, text = _resolve_due_date("Friday")

        target = date.fromisoformat(iso)
        days_ahead = (target - today).days

        self.assertEqual(text, "Friday")
        self.assertTrue(0 <= days_ahead < 7)
        self.assertEqual(target.weekday(), 4)

    def test_next_weekday_is_at_least_a_week_out(self):
        today = date.today()
        iso, _text = _resolve_due_date("next Friday")

        target = date.fromisoformat(iso)
        days_ahead = (target - today).days

        self.assertEqual(target.weekday(), 4)
        self.assertTrue(7 <= days_ahead < 14)

    def test_tomorrow_and_end_of_periods(self):
        today = date.today()

        iso, _ = _resolve_due_date("tomorrow")
        self.assertEqual(date.fromisoformat(iso), today + timedelta(days=1))

        iso, _ = _resolve_due_date("end of the week")
        target = date.fromisoformat(iso)
        self.assertEqual(target.weekday(), 6)
        self.assertGreaterEqual(target, today)

        iso, _ = _resolve_due_date("end of the month")
        target = date.fromisoformat(iso)
        self.assertGreaterEqual(target, today)

    def test_unresolvable_phrase_keeps_the_text(self):
        iso, text = _resolve_due_date("the next sprint")

        self.assertIsNone(iso)
        self.assertEqual(text, "the next sprint")

    def test_empty_input(self):
        self.assertEqual(_resolve_due_date(None), (None, None))
        self.assertEqual(_resolve_due_date("  "), (None, None))


class ProximityLinkingTests(unittest.TestCase):
    """A commitment following a decision sentence links to it."""

    def test_commitment_after_decision_is_linked(self):
        candidates = rule_based_extract(
            "We decided to use Redis because it scales well. "
            "Dora will set up the cache by 2026-12-15."
        )

        commitment = by_type(candidates, "COMMITMENT")[0]

        self.assertEqual(commitment["payload"]["decision_title"], "Redis")

    def test_commitment_before_any_decision_stays_unlinked(self):
        candidates = rule_based_extract(
            "Dora will set up the cache by 2026-12-15. "
            "We decided to use Redis."
        )

        commitment = by_type(candidates, "COMMITMENT")[0]

        self.assertIsNone(commitment["payload"]["decision_title"])

    def test_a_later_decision_takes_over_the_link(self):
        candidates = rule_based_extract(
            "We decided to use Redis. "
            "Dora will set up the cache. "
            "We decided to use Memcached. "
            "Eve will write the runbook."
        )

        commitments = by_type(candidates, "COMMITMENT")

        self.assertEqual(commitments[0]["payload"]["decision_title"], "Redis")
        self.assertEqual(
            commitments[1]["payload"]["decision_title"], "Memcached"
        )

    def test_intervening_sentences_keep_the_link(self):
        candidates = rule_based_extract(
            "We decided to use Redis. "
            "Bob depends on Carol. "
            "Dora will set up the cache by Friday."
        )

        commitment = by_type(candidates, "COMMITMENT")[0]

        self.assertEqual(commitment["payload"]["decision_title"], "Redis")


class ConfidenceTests(unittest.TestCase):
    """Confidence is deterministic evidence scoring over the payload."""

    def test_decision_with_rationale_scores_higher(self):
        bare = score_confidence(
            "DECISION", {"title": "Redis", "rationale": None}
        )
        with_rationale = score_confidence(
            "DECISION", {"title": "Redis", "rationale": "it scales"}
        )

        self.assertGreater(with_rationale, bare)

    def test_commitment_evidence_accumulates(self):
        bare = score_confidence(
            "COMMITMENT",
            {"owner": "Dora", "description": "ship", "due_date": None},
        )
        dated = score_confidence(
            "COMMITMENT",
            {
                "owner": "Dora",
                "description": "set up the cache",
                "due_date": "2026-12-15",
            },
        )
        dated_linked = score_confidence(
            "COMMITMENT",
            {
                "owner": "Dora",
                "description": "set up the cache",
                "due_date": "2026-12-15",
                "decision_title": "Redis",
            },
        )

        self.assertGreater(dated, bare)
        self.assertGreater(dated_linked, dated)
        self.assertGreaterEqual(dated_linked, HIGH_CONFIDENCE)

    def test_argument_evidence_accumulates(self):
        bare = score_confidence(
            "ARGUMENT", {"stance": "AGAINST", "claim": "no"}
        )
        full = score_confidence(
            "ARGUMENT",
            {
                "stance": "AGAINST",
                "claim": "the ops cost is too high",
                "author": "Bob",
                "target_title": "using Redis",
            },
        )

        self.assertGreater(full, bare)
        self.assertGreaterEqual(full, HIGH_CONFIDENCE)

    def test_scores_stay_in_unit_interval(self):
        for kind, payload in [
            ("DECISION", {"title": "x" * 40, "rationale": "y"}),
            ("COMMITMENT", {"description": "z" * 40, "due_date": "2026-01-01", "decision_title": "w"}),
            ("DEPENDENCY", {}),
            ("ARGUMENT", {"claim": "c" * 40, "author": "A", "target_title": "t"}),
            ("UNKNOWN", {}),
        ]:
            score = score_confidence(kind, payload)
            self.assertTrue(0 <= score <= 1, (kind, score))

    def test_extracted_commitment_with_resolved_nl_date_scores_higher(self):
        candidates = rule_based_extract(
            "Dora will set up the cache by Friday."
        )

        payload = candidates[0]["payload"]

        self.assertIsNotNone(payload["due_date"])
        self.assertEqual(payload["due_text"], "Friday")

        score = score_confidence("COMMITMENT", payload)
        self.assertGreaterEqual(score, 0.7)


if __name__ == "__main__":
    unittest.main()
