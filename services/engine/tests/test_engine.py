import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.engine import (  # noqa: E402
    constraint_violations,
    dominates,
    enrich_metrics,
    pareto_frontier,
    recommend,
    route_similarity,
)


def candidate(identifier="bus", duration=40, price=500, walk=5, wait=7, ride=26,
              transfer=2, mode="sotra", line="81", reliability=82, comfort=4):
    legs = [
        {"id": f"{identifier}-walk", "mode": "walk", "duration": walk, "price": 0, "geometry": [[-4.0, 5.3], [-4.01, 5.31]]},
        {"id": f"{identifier}-wait", "mode": "wait", "duration": wait, "price": 0, "geometry": []},
        {"id": f"{identifier}-ride", "mode": mode, "duration": ride, "price": price, "line_id": line, "geometry": [[-4.01, 5.31], [-4.02, 5.32]]},
    ]
    if transfer:
        legs.append({"id": f"{identifier}-transfer", "mode": "transfer", "duration": transfer, "price": 0, "geometry": [[-4.02, 5.32], [-4.021, 5.321]]})
    return {"id": identifier, "label": identifier, "duration": duration, "price": price, "walking_minutes": walk,
            "comfort": comfort, "reliability": reliability, "modes": [mode], "line_ids": [line], "legs": legs,
            "geometry": [[-4.0, 5.3], [-4.01, 5.31], [-4.02, 5.32]]}


class MetricsScenarios(unittest.TestCase):
    def test_01_duration_is_sum_of_components(self):
        item = enrich_metrics(candidate(duration=999))
        self.assertEqual(item["duration"], 40)

    def test_02_fares_are_summed_from_legs(self):
        item = enrich_metrics(candidate(price=700))
        self.assertEqual(item["price"], 700)

    def test_03_walk_distance_uses_phase1_speed(self):
        self.assertEqual(enrich_metrics(candidate(walk=8))["walking_distance_m"], 600)

    def test_04_waiting_is_separate(self):
        self.assertEqual(enrich_metrics(candidate(wait=11))["waiting_minutes"], 11)

    def test_05_in_vehicle_is_separate(self):
        self.assertEqual(enrich_metrics(candidate(ride=31))["in_vehicle_minutes"], 31)

    def test_06_three_boardings_mean_two_transfers(self):
        raw = candidate(transfer=0)
        raw["legs"] += [
            {"mode": "gbaka", "duration": 8, "price": 300, "line_id": "G1"},
            {"mode": "sotra", "duration": 9, "price": 200, "line_id": "82"},
        ]
        self.assertEqual(enrich_metrics(raw)["transfer_count"], 2)

    def test_07_bus_can_repeat_after_gbaka(self):
        raw = candidate(transfer=0)
        raw["legs"] += [{"mode": "gbaka", "duration": 8, "price": 300}, {"mode": "sotra", "duration": 9, "price": 200}]
        item = enrich_metrics(raw)
        self.assertEqual(item["bus_boardings"], 2)
        self.assertEqual(item["gbaka_boardings"], 1)

    def test_08_p90_is_not_below_p50(self):
        item = enrich_metrics(candidate())
        self.assertGreaterEqual(item["duration_p90"], item["duration"])


class ConstraintScenarios(unittest.TestCase):
    def violations(self, raw, **overrides):
        rules = {"max_budget_fcfa": 1500, "max_walking_distance_m": 1500, "max_transfers": 3,
                 "max_boardings": 4, "max_bus_boardings": 3, "max_gbaka_boardings": 2,
                 "max_boat_boardings": 1, "max_duration_minutes": 150, "excluded_modes": [], **overrides}
        return {item["code"] for item in constraint_violations(enrich_metrics(raw), rules)}

    def test_09_budget_is_hard(self): self.assertIn("budget", self.violations(candidate(price=1600)))
    def test_10_budget_equal_limit_is_valid(self): self.assertNotIn("budget", self.violations(candidate(price=1500)))
    def test_11_walking_is_hard(self): self.assertIn("walking", self.violations(candidate(walk=21)))
    def test_12_transfers_are_hard(self):
        raw = candidate(); raw["transfer_count"] = 4
        self.assertIn("transfers", self.violations(raw))
    def test_13_boardings_are_hard(self):
        raw = candidate(); raw["boarding_count"] = 5
        self.assertIn("boardings", self.violations(raw))
    def test_14_bus_boardings_are_hard(self):
        raw = candidate(); raw["bus_boardings"] = 4
        self.assertIn("bus_boardings", self.violations(raw))
    def test_15_gbaka_boardings_are_hard(self):
        raw = candidate(mode="gbaka"); raw["gbaka_boardings"] = 3
        self.assertIn("gbaka_boardings", self.violations(raw))
    def test_16_boat_boardings_are_hard(self):
        raw = candidate(mode="boat"); raw["boat_boardings"] = 2
        self.assertIn("boat_boardings", self.violations(raw))
    def test_17_duration_is_hard(self): self.assertIn("duration", self.violations(candidate(ride=151, walk=0, wait=0, transfer=0)))
    def test_18_excluded_mode_is_hard(self): self.assertIn("excluded_modes", self.violations(candidate(mode="taxi"), excluded_modes=["taxi"]))
    def test_19_multiple_failures_are_reported(self):
        codes = self.violations(candidate(price=2000, walk=30))
        self.assertTrue({"budget", "walking"}.issubset(codes))


class OptimisationScenarios(unittest.TestCase):
    def test_20_dominated_route_is_detected(self):
        good = enrich_metrics(candidate("good", price=400, ride=20, reliability=90, comfort=5))
        bad = enrich_metrics(candidate("bad", price=700, ride=35, walk=9, wait=10, reliability=60, comfort=2))
        self.assertTrue(dominates(good, bad))

    def test_21_dominated_route_is_not_presented(self):
        good = candidate("good", price=400, ride=20, reliability=90, comfort=5)
        bad = candidate("bad", price=700, ride=35, walk=9, wait=10, reliability=60, comfort=2)
        self.assertEqual([item["id"] for item in pareto_frontier([enrich_metrics(good), enrich_metrics(bad)])], ["good"])

    def test_22_tradeoff_stays_on_pareto_frontier(self):
        fast = enrich_metrics(candidate("fast", price=1200, ride=15))
        cheap = enrich_metrics(candidate("cheap", price=300, ride=40))
        self.assertEqual(len(pareto_frontier([fast, cheap])), 2)

    def test_23_identical_lines_have_full_overlap(self):
        self.assertEqual(route_similarity(enrich_metrics(candidate("a")), enrich_metrics(candidate("b"))), 1)

    def test_24_distinct_lines_have_no_overlap(self):
        self.assertEqual(route_similarity(enrich_metrics(candidate("a", line="81")), enrich_metrics(candidate("b", line="46"))), 0)

    def test_25_diversity_removes_duplicate_route(self):
        result = recommend([candidate("a", line="81"), candidate("b", line="81", price=450)], budget=1500)
        self.assertEqual(len(result["journeys"]), 1)

    def test_26_over_budget_route_is_never_conforming(self):
        result = recommend([candidate("too-expensive", price=1800)], budget=1000)
        self.assertEqual(result["journeys"], [])
        self.assertEqual(result["rejected"][0]["constraint_violations"][0]["code"], "budget")

    def test_27_cheap_profile_prefers_cost_tradeoff(self):
        routes = [candidate("fast", price=1200, ride=14, line="F"), candidate("cheap", price=300, ride=42, line="C")]
        self.assertEqual(recommend(routes, preference="cheap")["recommended_id"], "cheap")

    def test_28_fast_profile_prefers_time_tradeoff(self):
        routes = [candidate("fast", price=1200, ride=14, line="F"), candidate("cheap", price=300, ride=42, line="C")]
        self.assertEqual(recommend(routes, preference="fast")["recommended_id"], "fast")

    def test_29_recommendation_has_explanations(self):
        reasons = recommend([candidate("a")])["journeys"][0]["reasons"]
        self.assertTrue(reasons)
        self.assertIn("budget", reasons[0].lower())

    def test_30_pipeline_is_auditable(self):
        engine = recommend([candidate("a")])["engine"]
        self.assertEqual(engine["pipeline"], ["constraints", "pareto", "diversity", "scoring", "explanation"])

    def test_31_min_walking_profile_prefers_short_walk(self):
        routes = [candidate("short-walk", walk=2, ride=40, transfer=0, line="A"), candidate("long-walk", walk=15, ride=20, transfer=0, line="B")]
        self.assertEqual(recommend(routes, preference="min_walking")["recommended_id"], "short-walk")
        self.assertEqual(recommend(routes, preference="fast")["recommended_id"], "long-walk")

    def test_32_min_transfers_profile_prefers_direct_route(self):
        routes = [candidate("with-transfer", ride=20, transfer=2, line="A"), candidate("direct", ride=30, transfer=0, line="B")]
        self.assertEqual(recommend(routes, preference="min_transfers")["recommended_id"], "direct")

    def test_33_unlimited_budget_is_not_announced_as_reason(self):
        reasons = recommend([candidate("a")], budget=999999)["journeys"][0]["reasons"]
        self.assertFalse(any("budget" in reason.lower() for reason in reasons))

    def test_35_categories_rank_budget_middle_and_comfort(self):
        routes = [
            candidate("bus", price=200, ride=45, line="B", comfort=2, reliability=70),
            candidate("mixte", price=700, ride=25, line="M", comfort=3, reliability=78),
            candidate("taxi", price=2000, ride=15, walk=0, wait=3, transfer=0, mode="taxi", line="T", comfort=5, reliability=85),
        ]
        categories = recommend(routes, budget=999999)["categories"]
        self.assertEqual(categories["coule"][0], "bus")
        self.assertEqual(categories["suspendu"][0], "taxi")
        self.assertEqual(categories["debout"], ["mixte"])
        self.assertEqual(set(categories), {"coule", "debout", "suspendu"})

    def test_39_debout_is_empty_without_an_in_between_option(self):
        routes = [candidate("bus", price=200, ride=45, line="B", comfort=2), candidate("taxi", price=2000, ride=15, transfer=0, mode="taxi", line="T", comfort=5)]
        categories = recommend(routes, budget=999999)["categories"]
        self.assertEqual((categories["coule"][0], categories["suspendu"][0]), ("bus", "taxi"))
        self.assertEqual(categories["debout"], [])

    def test_36_category_leaders_are_always_returned_and_labelled(self):
        routes = [candidate("bus", price=200, ride=45, line="B", comfort=2), candidate("taxi", price=2000, ride=15, transfer=0, mode="taxi", line="T", comfort=5)]
        result = recommend(routes, budget=999999, preference="fast", max_results=1)
        ids = {journey["id"] for journey in result["journeys"]}
        self.assertIn(result["categories"]["coule"][0], ids)
        self.assertIn(result["categories"]["suspendu"][0], ids)
        bus = next(journey for journey in result["journeys"] if journey["id"] == "bus")
        self.assertIn("coule", bus["categories"])

    def test_37_single_journey_leads_every_category(self):
        result = recommend([candidate("seul")])
        self.assertEqual(result["categories"], {"coule": ["seul"], "debout": ["seul"], "suspendu": ["seul"]})
        self.assertEqual(sorted(result["journeys"][0]["categories"]), ["coule", "debout", "suspendu"])

    def test_38_no_feasible_journey_gives_empty_categories(self):
        result = recommend([candidate("cher", price=5000)], budget=1000)
        self.assertEqual(result["categories"], {"coule": [], "debout": [], "suspendu": []})

    def test_34_fastest_and_cheapest_ids_are_exposed(self):
        routes = [candidate("fast", price=1200, ride=14, line="F"), candidate("cheap", price=300, ride=42, line="C")]
        result = recommend(routes)
        self.assertEqual(result["fastest_id"], "fast")
        self.assertEqual(result["cheapest_id"], "cheap")


if __name__ == "__main__":
    unittest.main()
