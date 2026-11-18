import unittest

from app.services.extractor import rule_based_extract


def decisions(text):
    return [
        candidate
        for candidate in rule_based_extract(text)
        if candidate["candidate_type"] == "DECISION"
    ]


class DecisionExtractionTests(unittest.TestCase):
    """Extraction produces DECISION candidates only, with the maker."""

    def test_named_maker_is_captured(self):
        found = decisions(
            "Alice decided to use Redis because it scales well."
        )

        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["payload"]["decided_by"], "Alice")
        self.assertEqual(found[0]["payload"]["title"], "Redis")
        self.assertEqual(found[0]["payload"]["rationale"], "it scales well")

    def test_collective_decision_stays_team(self):
        found = decisions(
            "We decided to use Redis because it scales well."
        )

        self.assertEqual(len(found), 1)
        self.assertIsNone(found[0]["payload"]["decided_by"])

    def test_chinese_named_maker_is_captured(self):
        found = decisions("王芳决定采用 Redis。")

        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["payload"]["decided_by"], "王芳")
        self.assertEqual(found[0]["payload"]["title"], "Redis")

    def test_chinese_collective_keeps_the_verb(self):
        found = decisions("我们决定迁移到云。")

        self.assertEqual(len(found), 1)
        self.assertIsNone(found[0]["payload"]["decided_by"])
        self.assertEqual(found[0]["payload"]["title"], "迁移到云")

    def test_commitments_and_dependencies_are_not_extracted(self):
        candidates = rule_based_extract(
            "We decided to use Redis. "
            "Dora will set up the cache by 2026-12-15. "
            "Eve depends on Dora."
        )

        kinds = {candidate["candidate_type"] for candidate in candidates}
        self.assertEqual(kinds, {"DECISION"})


if __name__ == "__main__":
    unittest.main()
