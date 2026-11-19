import unittest

from app.services.evaluation import (
    inter_annotator_agreement,
    score_all,
    score_type,
    verification_rates,
    wrong_type_count,
)

TEXT = (
    "We decided to use Redis because it scales well. "
    "Dora will set up the cache by 2026-12-15."
)


def decision(title="Redis", rationale="it scales well", span=None):
    return {
        "type": "DECISION",
        "fields": {"title": title, "rationale": rationale},
        "span": span or "We decided to use Redis because it scales well",
    }


def commitment(owner="Dora", description="set up the cache",
               due_date="2026-12-15", decision_title="Redis", span=None):
    return {
        "type": "COMMITMENT",
        "fields": {
            "owner": owner,
            "description": description,
            "due_date": due_date,
            "decision_title": decision_title,
        },
        "span": span or "Dora will set up the cache by 2026-12-15",
    }


class ScoringTests(unittest.TestCase):
    def test_perfect_extraction_is_full_marks(self):
        gold = [decision(), commitment()]
        predicted = [decision(), commitment()]

        result = score_type(gold, predicted, "DECISION", TEXT)

        self.assertEqual(result["true_positives"], 1)
        self.assertEqual(result["false_positives"], 0)
        self.assertEqual(result["false_negatives"], 0)
        self.assertEqual(result["precision"], 1.0)
        self.assertEqual(result["recall"], 1.0)
        self.assertEqual(result["f1"], 1.0)
        self.assertEqual(result["taxonomy"], {})

    def test_missed_entity_is_the_recall_penalty(self):
        gold = [decision(), commitment()]
        predicted = [decision()]

        result = score_type(gold, predicted, "COMMITMENT", TEXT)

        self.assertEqual(result["false_negatives"], 1)
        self.assertEqual(result["recall"], 0.0)
        self.assertEqual(result["taxonomy"]["missed_entity"], 1)

    def test_hallucination_is_told_apart_from_plain_false_positive(self):
        gold = [decision()]
        in_text = decision(
            title="set up the cache",
            rationale=None,
            span="Dora will set up the cache by 2026-12-15",
        )
        invented = decision(
            title="Kafka",
            rationale="invented",
            span="We decided to use Kafka because it is fast",
        )

        result = score_type(
            gold, [in_text, invented], "DECISION", TEXT
        )

        self.assertEqual(result["false_positives"], 2)
        self.assertEqual(result["taxonomy"]["false_positive"], 1)
        self.assertEqual(result["taxonomy"]["hallucinated"], 1)

    def test_wrong_field_is_reported_per_field(self):
        gold = [decision(rationale="it scales well")]
        predicted = [decision(rationale="it is cheap")]

        result = score_type(gold, predicted, "DECISION", TEXT)

        self.assertEqual(result["true_positives"], 1)
        self.assertEqual(result["taxonomy"]["wrong_field:rationale"], 1)

    def test_matching_tolerates_span_normalization(self):
        gold = [decision()]
        predicted = [decision(
            span="We decided to use Redis because it scales well "
        )]

        result = score_type(gold, predicted, "DECISION", TEXT)

        self.assertEqual(result["true_positives"], 1)

    def test_wrong_type_is_detected_across_types(self):
        gold = [decision()]
        # Same source span, but the pipeline typed it as a commitment.
        predicted = [commitment(
            span="We decided to use Redis because it scales well"
        )]

        self.assertEqual(
            wrong_type_count(gold, predicted, TEXT), 1
        )

        result = score_all(gold, predicted, TEXT)
        self.assertEqual(result["wrong_type"], 1)

    def test_score_all_covers_every_type(self):
        gold = [decision(), commitment()]
        predicted = [decision()]

        result = score_all(gold, predicted, TEXT)

        self.assertIn("DECISION", result["per_type"])
        self.assertIn("COMMITMENT", result["per_type"])
        self.assertEqual(result["wrong_type"], 0)


class InterAnnotatorTests(unittest.TestCase):
    def test_identical_annotations_agree_perfectly(self):
        entities_a = [dict(decision(), _annotator="A")]
        entities_b = [dict(decision(), _annotator="B")]

        result = inter_annotator_agreement(entities_a, entities_b)

        self.assertEqual(result["both"], 1)
        self.assertEqual(result["only_a"], 0)
        self.assertEqual(result["only_b"], 0)
        self.assertEqual(result["cohens_kappa"], 1.0)
        self.assertEqual(result["field_agreement"]["title"], 1.0)

    def test_disagreement_lowers_kappa(self):
        entities_a = [dict(decision(), _annotator="A")]
        entities_b = [
            dict(decision(rationale="it is cheap"), _annotator="B")
        ]

        result = inter_annotator_agreement(entities_a, entities_b)

        self.assertEqual(result["field_agreement"]["rationale"], 0.0)
        self.assertEqual(result["cohens_kappa"], 1.0)  # presence agrees

    def test_presence_disagreement_drops_kappa(self):
        entities_a = [
            dict(decision(), _annotator="A"),
            dict(commitment(), _annotator="A"),
        ]
        entities_b = [dict(decision(), _annotator="B")]

        result = inter_annotator_agreement(entities_a, entities_b)

        self.assertEqual(result["only_a"], 1)
        self.assertLess(result["cohens_kappa"], 1.0)


class VerificationRateTests(unittest.TestCase):
    def test_rates(self):
        candidates = [
            {"status": "CONFIRMED"},
            {"status": "CONFIRMED"},
            {"status": "REJECTED"},
        ]

        result = verification_rates(candidates)

        self.assertEqual(result["total"], 3)
        self.assertEqual(result["confirmed_rate"], round(2 / 3, 3))
        self.assertEqual(result["rejected_rate"], round(1 / 3, 3))
        self.assertIsNone(result["edit_rate"])

    def test_empty_list(self):
        result = verification_rates([])

        self.assertIsNone(result["confirmed_rate"])


if __name__ == "__main__":
    unittest.main()
