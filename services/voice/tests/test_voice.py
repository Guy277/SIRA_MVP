"""Tests du service vocal sans les gros modèles : faux NLU (règles), faux moteur, vrai correcteur de lieux.

Lancer : npm run test:voice   (ou  python -m unittest discover -s services/voice/tests -v)
"""
import os
import re
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # racine du dépôt SIRA
os.environ.setdefault("VOICE_GAZETTEER", str(FIXTURES / "gazetteer_test.json"))
os.environ.setdefault("VOICE_MODELS_DIR", str(FIXTURES / "absent"))
os.environ.setdefault("VOICE_PIPER_MODEL", str(FIXTURES / "absent.onnx"))
os.environ.setdefault("VOICE_PRELOAD", "0")  # les tests n'utilisent pas les gros modèles

from fastapi.testclient import TestClient  # noqa: E402

from services.voice.app import normalize as nz  # noqa: E402
from services.voice.app.dialog import JourneyServiceError, VoiceDialog  # noqa: E402
from services.voice.app.knowledge import KnowledgeBase  # noqa: E402
from services.voice.app.main import create_app  # noqa: E402
from services.voice.app.resolver import Match, PlaceResolver, same_name  # noqa: E402
from services.voice.app.short_answer import parse_amount, yes_no  # noqa: E402
from services.voice.app.trip import TripAnswers  # noqa: E402


class FakeNLU:
    """Remplace CamemBERT dans les tests : quelques règles suffisent à exercer la chaîne."""

    def predict(self, text):
        t = text.lower()
        intent = ("confirm" if re.fullmatch(r"(oui|ya foye)\.?", t) else "deny" if t.startswith("non") else
                  "ask_cheapest" if "barre" in t or "moins cher" in t else "ask_fastest" if "pressé" in t else
                  "ask_fare" if "combien" in t else "voice_help" if "aide" in t else "navigate_to")
        entities = []
        for label, pattern in [("ORIGIN", r"quitte ([\w' é-]+?)(?:,| je|$)"), ("DESTINATION", r"(?:sur|au|à|pour|c'est) ([\w' é-]+?)(?:,| j'ai| ça|$)"),
                               ("BUDGET", r"(une barre|\d+ francs)"), ("MODE", r"\b(gbaka)\b")]:
            m = re.search(pattern, t)
            if m:
                entities.append({"label": label, "start": m.start(1), "end": m.end(1), "text": text[m.start(1):m.end(1)], "score": 0.99})
        return intent, 0.95, entities


FAKE_RESULT = {
    "recommended_id": "j1", "fastest_id": "j2", "cheapest_id": "j1",
    "journeys": [
        {"id": "j1", "label": "Gbaka Adjamé – Plateau", "duration": 42, "price": 400, "walking_minutes": 6,
         "legs": [{"mode": "walk", "label": "Rejoindre le réseau"}, {"mode": "gbaka", "label": "Adjamé Liberté → Plateau", "line_code": "G12"}]},
        {"id": "j2", "label": "Taxi / route directe", "duration": 25, "price": 3000, "walking_minutes": 0, "legs": [{"mode": "taxi", "label": "Taxi"}]},
    ],
}


class Planner:
    def __init__(self, result=FAKE_RESULT, error=None):
        self.calls, self.result, self.error = [], result, error

    def __call__(self, request):
        self.calls.append(request)
        if self.error:
            raise self.error
        return self.result


POSITION = {"lat": 5.3467, "lon": -3.9951, "name": "Cocody Danga"}


class ResolverTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.r = PlaceResolver(FIXTURES / "gazetteer_test.json")

    def top(self, text):
        return self.r.resolve(text)[0].canonical

    def test_prononciations_approximatives(self):
        self.assertEqual(self.top("plato"), "Plateau")
        self.assertEqual(self.top("yop"), "Yopougon")
        self.assertEqual(self.top("koumassi grand carrefour"), "Grand Carrefour de Koumassi")
        self.assertEqual(self.top("rivièra palmeraie"), "Riviera Palmeraie")

    def test_nom_court_ne_gagne_plus(self):
        # Bug observé sur Colab : « adja mé vingt logement » partait vers l'arrêt « Adja » (Anyama)
        self.assertEqual(self.top("adja mé vingt logement"), "Adjamé 220 Logements")

    def test_vingt_logements_sans_hesitation(self):
        # Bug observé sur le service réel : « vingt » n'était pas un nombre, et « Pharmacie la Mé » (seule la
        # syllabe « mé » en commun) arrivait à 0,5 point : SIRA demandait « Adjamé 220 Logements ou Pharmacie la Mé ? »
        matches = self.r.resolve("adja mé vingt logement")
        self.assertEqual(matches[0].canonical, "Adjamé 220 Logements")
        self.assertIsNone(self.r.decide(matches, 60, 3))
        self.assertEqual(self.top("yopougon vingt sept"), "Yopougon")  # « vingt sept » reste 27, pas « 20 sept »

    def test_meme_lieu_mots_dans_un_autre_ordre(self):
        # Bug observé en audio : « Tu veux dire Adjamé 220 Logements ou 220 Lgts Adjamé ? » (deux noms du même lieu)
        self.assertTrue(same_name("Adjamé 220 Logements", "220 Lgts Adjamé"))
        self.assertFalse(same_name("Marché (Abobo)", "Marché (Attécoubé)"))
        a = Match("PL-00018", "Adjamé 220 Logements", "quartier", "Adjamé", 5.35174, -4.016983, 92.1)
        b = Match("PL-01234", "220 Lgts Adjamé", "stop", "Adjamé", 5.3521, -4.0172, 90.1)
        self.assertIsNone(self.r.decide([a, b], 60, 3))

    def test_decisions(self):
        self.assertIsNone(self.r.decide(self.r.resolve("plato"), 60, 3))
        self.assertEqual(self.r.decide(self.r.resolve("marché"), 60, 3), "ambiguous_place")
        self.assertEqual(self.r.decide(self.r.resolve("orange digital center"), 60, 3), "place_without_coordinates")
        self.assertEqual(self.r.decide([], 60, 3), "unresolvable_place")


class NormalizeTest(unittest.TestCase):
    def test_budget(self):
        self.assertEqual(nz.budget_fcfa("une barre"), 1000)
        self.assertEqual(nz.budget_fcfa("deux barres"), 2000)
        self.assertEqual(nz.budget_fcfa("1 500 F"), 1500)
        self.assertEqual(nz.budget_fcfa("cinq cents francs"), 500)

    def test_modes_api_sira(self):
        self.assertEqual(nz.mode_code("woro woro"), "woro")
        self.assertEqual(nz.mode_code("wôrô"), "woro")
        self.assertEqual(nz.mode_code("bus SOTRA"), "sotra")
        self.assertEqual(nz.mode_code("baka"), "gbaka")
        self.assertEqual(nz.mode_code("bateau bus"), "boat")

    def test_heure_depart(self):
        now = datetime(2026, 9, 26, 10, 0, tzinfo=timezone.utc)
        self.assertTrue(nz.departure_at("à 18h", now).startswith("2026-09-26T18:00"))
        self.assertTrue(nz.departure_at("demain matin", now).startswith("2026-09-27T07:30"))
        self.assertTrue(nz.departure_at("dans 30 minutes", now).startswith("2026-09-26T10:30"))
        self.assertIsNone(nz.departure_at("maintenant", now))


class DialogTest(unittest.TestCase):
    def setUp(self):
        self.planner = Planner()
        self.d = VoiceDialog(FakeNLU(), PlaceResolver(FIXTURES / "gazetteer_test.json"), 60, 3, 0.5, self.planner)

    def test_trajet_simple_depuis_ma_position(self):
        out = self.d.ask("je vais au plato", POSITION)
        req = self.planner.calls[0]
        self.assertEqual(req["origin"], POSITION)
        self.assertEqual(req["destination"]["name"], "Plateau")
        self.assertEqual(req["preference"], "balanced")
        self.assertIn("400 francs", out["reply_text"])  # chiffre venu du moteur, pas inventé
        self.assertIn("gbaka G12", out["reply_text"])

    def test_budget_et_origine_parlee(self):
        self.d.ask("je quitte yop, je veux béou sur plato, j'ai une barre")
        req = self.planner.calls[0]
        self.assertEqual(req["origin"]["name"], "Yopougon")
        self.assertEqual(req["preference"], "cheap")
        self.assertEqual(req["budget"], 1000)

    def test_destination_manquante(self):
        out = self.d.ask("je veux béou", POSITION)
        self.assertEqual(self.planner.calls, [])
        self.assertIn("missing_destination", out["understanding"]["reasons"])
        self.assertEqual(out["reply_text"], "Tu veux aller où ?")

    def test_sans_position_on_demande_le_depart(self):
        out = self.d.ask("je vais au plato")
        self.assertEqual(self.planner.calls, [])
        self.assertEqual(out["reply_text"], "D'où est-ce que tu pars ?")

    def test_confirmation_puis_ya_foye(self):
        first = self.d.ask("je vais au marché", POSITION)
        self.assertEqual(self.planner.calls, [])
        self.assertTrue(first["understanding"]["needs_confirmation"])
        self.assertIn("?", first["reply_text"])
        second = self.d.ask("ya foye", POSITION, first["context"])
        self.assertEqual(len(self.planner.calls), 1)
        self.assertTrue(second["reply_text"].startswith("Ya foye."))

    def test_non_avec_correction(self):
        first = self.d.ask("je vais au marché", POSITION)
        self.d.ask("non c'est riviera palmeraie", POSITION, first["context"])
        self.assertEqual(self.planner.calls[0]["destination"]["name"], "Riviera Palmeraie")

    def test_moteur_arrete(self):
        d = VoiceDialog(FakeNLU(), PlaceResolver(FIXTURES / "gazetteer_test.json"), 60, 3, 0.5,
                        Planner(error=JourneyServiceError("503", "Le moteur de trajets est arrêté.")))
        out = d.ask("je vais au plato", POSITION)
        self.assertEqual(out["reply_text"], "Le moteur de trajets est arrêté.")

    def test_prix(self):
        out = self.d.ask("le gbaka pour plato ça fait combien", POSITION)
        self.assertIn("environ 400 francs", out["reply_text"])

    def test_prix_du_mode_demande(self):
        # Bug observé : « le gbaka pour anyama ça fait combien » donnait le prix du taxi (trajet recommandé)
        result = {"recommended_id": "taxi", "fastest_id": "taxi", "cheapest_id": "bus",
                  "journeys": [
                      {"id": "taxi", "label": "Taxi / route directe", "duration": 60, "price": 9900, "walking_minutes": 0,
                       "legs": [{"mode": "taxi", "label": "Taxi compteur / partagé"}]},
                      {"id": "bus", "label": "Option min_walking", "duration": 113, "price": 400, "walking_minutes": 9,
                       "legs": [{"mode": "sotra", "line_code": "52", "label": "bus 52"}]},
                      {"id": "gbk", "label": "Option fast", "duration": 108, "price": 800, "walking_minutes": 7,
                       "legs": [{"mode": "sotra", "line_code": "52", "label": "bus 52"}, {"mode": "gbaka", "label": "gbaka : Abobo Gare ↔ Anyama"}]},
                  ]}
        d = VoiceDialog(FakeNLU(), PlaceResolver(FIXTURES / "gazetteer_test.json"), 60, 3, 0.5, Planner(result))
        reply = d.ask("le gbaka pour anyama ça fait combien", POSITION)["reply_text"]
        self.assertIn("environ 800 francs", reply)
        self.assertIn("le gbaka", reply)
        self.assertNotIn("9900", reply)

    def test_mode_demande_introuvable(self):
        d = VoiceDialog(FakeNLU(), PlaceResolver(FIXTURES / "gazetteer_test.json"), 60, 3, 0.5,
                        Planner({"recommended_id": "j2", "journeys": [FAKE_RESULT["journeys"][1]]}))
        reply = d.ask("le gbaka pour plato ça fait combien", POSITION)["reply_text"]
        self.assertTrue(reply.startswith("Je n'ai pas trouvé de trajet en gbaka."))
        self.assertIn("3000 francs", reply)  # l'autre trajet est annoncé honnêtement, avec le chiffre du moteur

    def test_reponse_sans_jargon(self):
        # Bugs observés : « dont 0 minutes à pied » et le libellé technique « Option fast » lu à voix haute
        d = VoiceDialog(FakeNLU(), PlaceResolver(FIXTURES / "gazetteer_test.json"), 60, 3, 0.5, Planner(
            {"recommended_id": "a", "cheapest_id": "b", "journeys": [
                {"id": "a", "label": "Taxi / route directe", "duration": 18, "price": 1300, "walking_minutes": 0,
                 "legs": [{"mode": "taxi", "label": "Taxi compteur / partagé"}]},
                {"id": "b", "label": "Option fast", "duration": 49, "price": 200, "walking_minutes": 6,
                 "legs": [{"mode": "sotra", "line_code": "26", "label": "bus 26"}, {"mode": "sotra", "line_code": "26"}]}]}))
        taxi = d.ask("je vais au plato", POSITION)["reply_text"]
        self.assertNotIn("0 minutes à pied", taxi)
        self.assertIn("sans marche", taxi)
        self.assertNotIn("Prends le taxi", taxi)
        bus = d.ask("je quitte yop, je veux béou sur plato, j'ai une barre")["reply_text"]
        self.assertNotIn("Option", bus)
        self.assertIn("le bus SOTRA 26.", bus)  # deux tronçons de la même ligne : dit une seule fois

    def test_ligne_dite_une_fois_sans_fleche(self):
        # Bug observé : « Prends le gbaka : gbaka : Adjamé Liberté ↔ Yopougon Palais »
        d = VoiceDialog(FakeNLU(), PlaceResolver(FIXTURES / "gazetteer_test.json"), 60, 3, 0.5, Planner(
            {"recommended_id": "a", "journeys": [{"id": "a", "label": "Option cheap", "duration": 38, "price": 500, "walking_minutes": 6,
                                                  "legs": [{"mode": "gbaka", "label": "gbaka : Adjamé Liberté ↔ Yopougon Palais"}]}]}))
        reply = d.ask("je vais au plato", POSITION)["reply_text"]
        self.assertIn("Prends le gbaka, ligne Adjamé Liberté – Yopougon Palais.", reply)
        self.assertNotIn("↔", reply)


class FixedNLU:
    """NLU qui renvoie toujours la même intention (pour reproduire des erreurs du vrai modèle)."""

    def __init__(self, intent, confidence=0.9):
        self.intent, self.confidence = intent, confidence

    def predict(self, text):
        return self.intent, self.confidence, []


class ConversationTest(unittest.TestCase):
    def dialog(self, nlu, planner=None):
        return VoiceDialog(nlu, PlaceResolver(FIXTURES / "gazetteer_test.json"), 60, 3, 0.5, planner or Planner())

    def test_lieu_dit_seul_est_une_destination(self):
        # Bug observé : « Cocody ! » compris comme « oui » → « C'est noté. » au lieu de partir
        planner = Planner()
        out = self.dialog(FixedNLU("confirm"), planner).ask("Yopougon !", POSITION)
        self.assertEqual(planner.calls[0]["destination"]["name"], "Yopougon")
        self.assertEqual(out["kind"], "journeys")
        self.assertEqual(out["chosen_id"], "j1")  # le trajet annoncé, que l'app démarre

    def test_oui_seul_reste_un_oui(self):
        planner = Planner()
        out = self.dialog(FixedNLU("confirm"), planner).ask("oui", POSITION)
        self.assertEqual(planner.calls, [])
        self.assertEqual(out["reply_text"], "C'est noté.")

    def test_reponse_a_d_ou_tu_pars(self):
        planner = Planner()
        d = self.dialog(FakeNLU(), planner)
        first = d.ask("je vais au plato")  # pas de position : SIRA demande le départ
        self.assertEqual(first["kind"], "question")
        second = d.ask("Yopougon", None, first["context"])
        self.assertEqual(planner.calls[0]["origin"]["name"], "Yopougon")
        self.assertEqual(planner.calls[0]["destination"]["name"], "Plateau")
        self.assertTrue(second["reply_text"].startswith("D'accord."))

    def test_lieu_seul_compris_comme_oui_repond_a_d_ou_tu_pars(self):
        # Bug observé avec le vrai modèle : « Adjamé » → confirm (0,60) → « C'est noté. » au lieu de calculer
        planner = Planner()
        first = self.dialog(FakeNLU(), planner).ask("je vais au plato")
        second = self.dialog(FixedNLU("confirm", 0.6), planner).ask("Adjamé", None, first["context"])
        self.assertEqual(planner.calls[0]["origin"]["name"], "Adjamé")
        self.assertEqual(second["kind"], "journeys")

    def test_pas_compris_on_fait_repeter_poliment(self):
        out = self.dialog(FixedNLU("navigate_to", 0.2)).ask("euh", POSITION)
        self.assertEqual(out["kind"], "retry")
        self.assertIn("un peu plus fort, s'il te plaît", out["reply_text"])

    def test_trajet_annonce_renvoye(self):
        out = self.dialog(FakeNLU()).ask("je vais au plato", POSITION)
        self.assertEqual(out["kind"], "journeys")
        self.assertEqual(out["chosen_id"], "j1")


KNOWLEDGE = KnowledgeBase.load(Path(__file__).resolve().parents[1] / "knowledge")
NOW = datetime(2026, 9, 27, 10, 0, tzinfo=timezone.utc)

# Trajet suivi dans l'app : gbaka Adjamé → Plateau, puis bus 52 Plateau → Koumassi (tracés [lon, lat]).
TRIP = {
    "destination": {"lat": 5.291807, "lon": -3.960256, "name": "Koumassi"},
    "journey": {"id": "j1", "duration": 55, "price": 500, "legs": [
        {"mode": "walk", "label": "Rejoindre le réseau", "duration": 4, "price": 0, "geometry": [[-4.0215, 5.3550], [-4.0209, 5.3543]]},
        {"mode": "wait", "label": "Attente estimée — gbaka", "duration": 6, "price": 0, "geometry": []},
        {"mode": "gbaka", "label": "gbaka : Adjamé ↔ Plateau", "duration": 15, "price": 300,
         "geometry": [[-4.0209, 5.3543], [-4.0197, 5.3400], [-4.0185, 5.3265]]},
        {"mode": "wait", "label": "Attente estimée — sotra", "duration": 8, "price": 0, "geometry": []},
        {"mode": "sotra", "label": "bus 52 : Plateau ↔ Koumassi", "line_code": "52", "duration": 20, "price": 200,
         "geometry": [[-4.0185, 5.3265], [-3.9602, 5.2918]]},
    ]},
}


class FakeLive:
    """Signalements des voyageurs (API /reports) sans serveur."""

    def __init__(self, impact=None, reports=(), error=None):
        self.impact_result = impact or {"affected": [], "unconfirmed": [], "delayMinutes": 0, "blocking": False, "requiresReroute": False}
        self.reports_result, self.error, self.calls = list(reports), error, []

    def impact(self, legs):
        self.calls.append(legs)
        if self.error:
            raise self.error
        return self.impact_result

    def reports(self):
        if self.error:
            raise self.error
        return self.reports_result


class EntityNLU(FixedNLU):
    """Intention et entités imposées (« ça bouche à Adjamé ? » → traffic_status + PLACE)."""

    def __init__(self, intent, entities, confidence=0.9):
        super().__init__(intent, confidence)
        self.entities = entities

    def predict(self, text):
        found = []
        for label, words in self.entities:
            start = text.lower().index(words.lower())
            found.append({"label": label, "start": start, "end": start + len(words), "text": text[start:start + len(words)], "score": 0.99})
        return self.intent, self.confidence, found


def numbers(text):
    return set(re.findall(r"\d+", text))


class KnowledgeTest(unittest.TestCase):
    """La FAQ elle-même : fiches valides, courtes, sans prix écrit à la main, et bien retrouvées."""

    def test_fiches_courtes_et_sans_prix_inventes(self):
        self.assertGreater(len(KNOWLEDGE), 40)
        for passage in KNOWLEDGE.passages:
            if passage.answer is None:
                self.assertTrue(passage.action.startswith("trip_"), passage.id)
                continue
            self.assertLessEqual(len(re.findall(r"[.!?](?:\s|$)", passage.answer)), 2, passage.id)  # 2 phrases maximum à l'oral
            self.assertIsNone(re.search(r"\d+\s*(f|francs?|fcfa)\b", passage.answer, re.I), passage.id)  # prix : moteur seulement

    def test_questions_retrouvees(self):
        cases = {"c'est quoi la différence entre gbaka et wôrô": "modes.gbaka-woro", "le bateau-bus part d'où à Treichville": "reseau.bateau-treichville",
                 "comment utiliser SIRA": "sira.utiliser", "c'est quoi Coulé Debout Suspendu": "categories.explication",
                 "ça veut dire quoi une barre": "LEX-0008", "vous gardez ma voix": "sira.voix-conservee", "c'est quoi un woro woro": "modes.woro",
                 "je descends où": "trajet.arrets", "je change où": "trajet.correspondance", "y a des bouchons sur mon trajet": "trajet.incidents",
                 "pardon le gbaka c'est quoi même": "modes.gbaka", "qui a fait SIRA": "sira.equipe", "merci": "echanges.merci"}
        for said, expected in cases.items():
            hit = KNOWLEDGE.search(said, 1)[0]
            self.assertEqual(hit.passage.id, expected, said)
            self.assertGreaterEqual(hit.score, 0.65, said)

    def test_hors_sujet_sans_fiche(self):
        for said in ("il va pleuvoir demain", "raconte moi une blague", "c'est quoi le score du match", "euh", "Cocody", "Treichville"):
            self.assertLess(KNOWLEDGE.search(said, 1)[0].score, 0.65, said)


class FaqDialogTest(unittest.TestCase):
    def dialog(self, nlu, planner=None, live=None):
        resolver = PlaceResolver(FIXTURES / "gazetteer_test.json")
        planner = planner or Planner()
        live = live or FakeLive()
        trips = TripAnswers(resolver, planner, live.impact, live.reports, now=lambda: NOW)
        return VoiceDialog(nlu, resolver, 60, 3, 0.5, planner, KNOWLEDGE, trips)

    def test_question_de_faq(self):
        planner = Planner()
        out = self.dialog(FixedNLU("ask_mode"), planner).ask("C'est quoi un gbaka ?", POSITION)
        self.assertTrue(out["reply_text"].startswith("Le gbaka est un minibus"))
        self.assertEqual((out["kind"], out["sources"]), ("info", ["modes.gbaka"]))
        self.assertEqual(planner.calls, [])  # pas de trajet calculé, pas de « Tu veux aller où ? »

    def test_confiance_faible_mais_fiche_claire(self):
        # « comment utiliser SIRA » : voice_help à 0,46 → ne doit pas faire répéter
        out = self.dialog(FixedNLU("voice_help", 0.46)).ask("comment utiliser SIRA", POSITION)
        self.assertEqual((out["kind"], out["sources"]), ("info", ["sira.utiliser"]))

    def test_vraie_demande_de_trajet_non_detournee(self):
        planner = Planner()
        out = self.dialog(FakeNLU(), planner).ask("le gbaka pour plato ça fait combien", POSITION)
        self.assertEqual(out["kind"], "journeys")
        self.assertEqual(planner.calls[0]["destination"]["name"], "Plateau")

    def test_pas_compris_sans_fiche_on_fait_repeter(self):
        # Bug observé : « euh » / « bonjour » mal classés → « C'est noté. » alors que l'app rouvrait le micro
        out = self.dialog(FixedNLU("confirm", 0.3)).ask("euh", POSITION)
        self.assertEqual(out["kind"], "retry")
        self.assertIn("répéter", out["reply_text"])
        self.assertEqual(self.dialog(FixedNLU("confirm", 0.3)).ask("bonjour", POSITION)["sources"], ["echanges.bonjour"])

    def test_hors_sujet_refus_poli(self):
        # Vrai modèle : « il va pleuvoir demain ? » → traffic_status à 0,60 ; « raconte-moi une blague » → out_of_scope à 0,35
        rain = self.dialog(FixedNLU("traffic_status", 0.6)).ask("il va pleuvoir demain ?", POSITION, trip=TRIP)
        self.assertNotIn("trajet", rain["reply_text"])
        joke = self.dialog(FixedNLU("out_of_scope", 0.35)).ask("raconte moi une blague", POSITION)
        self.assertEqual(joke["kind"], "info")
        self.assertIn("déplacements", joke["reply_text"])

    def test_sans_trajet_en_cours(self):
        out = self.dialog(FixedNLU("ask_nearby_landmark", 0.37)).ask("où en est mon trajet ?", POSITION)
        self.assertIn("pas de trajet en cours", out["reply_text"])
        # « ça fait combien ? » sans trajet : SIRA demande la destination, comme avant
        self.assertEqual(self.dialog(FixedNLU("ask_fare")).ask("ça fait combien ?", POSITION)["reply_text"], "Tu veux aller où ?")

    def test_je_descends_ou(self):
        out = self.dialog(FixedNLU("ask_transfer")).ask("je descends où ?", POSITION, trip=TRIP)
        self.assertEqual(out["reply_text"], "Monte dans le gbaka vers Adjamé, et descends vers Plateau. "
                                            "Ensuite, monte dans le bus SOTRA 52 vers Plateau, et descends vers Koumassi.")
        self.assertEqual(out["kind"], "info")

    def test_je_change_ou(self):
        out = self.dialog(FixedNLU("ask_transfer")).ask("je change où ?", POSITION, trip=TRIP)
        self.assertEqual(out["reply_text"], "Tu changes vers Plateau : tu quittes le gbaka pour prendre le bus SOTRA 52.")

    def test_prix_du_trajet_en_cours(self):
        out = self.dialog(FixedNLU("ask_fare")).ask("ça fait combien ?", POSITION, trip=TRIP)
        self.assertTrue(out["reply_text"].startswith("Ton trajet coûte environ 500 francs : 300 pour le gbaka et 200 pour le bus SOTRA 52."))
        self.assertEqual(out["journeys"], None)

    def test_arrivee_recalculee_depuis_ma_position(self):
        planner = Planner()
        out = self.dialog(FixedNLU("ask_eta"), planner).ask("j'arrive à quelle heure ?", POSITION, trip=TRIP)
        self.assertEqual(planner.calls[0]["destination"]["name"], "Koumassi")
        self.assertEqual(planner.calls[0]["origin"]["lat"], POSITION["lat"])
        self.assertTrue(out["reply_text"].startswith("D'ici, compte environ 42 minutes jusqu'à Koumassi, arrivée vers 10 h 42."))

    def test_arrivee_sans_position(self):
        out = self.dialog(FixedNLU("ask_eta")).ask("j'arrive à quelle heure ?", None, trip=TRIP)
        self.assertEqual(out["reply_text"], "Ton trajet vers Koumassi dure environ 55 minutes au total, d'après SIRA.")

    def test_incidents_sur_mon_trajet(self):
        live = FakeLive({"affected": [{"report": {"title": "Accident", "location": "Pont HKB"}, "delayMinutes": 10, "legIndex": 2}],
                         "unconfirmed": [], "delayMinutes": 10, "blocking": False, "requiresReroute": False})
        out = self.dialog(FixedNLU("traffic_status"), live=live).ask("y a des bouchons sur mon trajet ?", POSITION, trip=TRIP)
        self.assertEqual(out["reply_text"], "Attention : accident signalé vers Pont HKB sur ton trajet, environ 10 minutes de retard.")
        self.assertIn("signalements", out["sources"])
        self.assertEqual(len(live.calls[0]), len(TRIP["journey"]["legs"]))
        calm = self.dialog(FixedNLU("traffic_status")).ask("y a des bouchons sur mon trajet ?", POSITION, trip=TRIP)
        self.assertEqual(calm["reply_text"], "Aucun incident signalé sur ton trajet pour le moment.")

    def test_signalements_indisponibles(self):
        from services.voice.app.trip import LiveDataError
        out = self.dialog(FixedNLU("traffic_status"), live=FakeLive(error=LiveDataError("503"))).ask(
            "il y a un problème sur mon trajet ?", POSITION, trip=TRIP)
        self.assertIn("n'arrive pas à vérifier", out["reply_text"])

    def test_ca_bouche_vers_un_lieu(self):
        live = FakeLive(reports=[{"title": "Embouteillage", "status": "reported", "lat": 5.3550, "lon": -4.0200},
                                 {"title": "Accident", "status": "confirmed", "lat": 5.2918, "lon": -3.9602}])
        out = self.dialog(EntityNLU("traffic_status", [("PLACE", "Adjamé")]), live=live).ask("ça bouche à Adjamé ?", POSITION, trip=TRIP)
        self.assertEqual(out["reply_text"], "Vers Adjamé : embouteillage signalé, pas encore confirmé.")

    def test_aucun_chiffre_invente(self):
        # Tout nombre dit sur le trajet existe dans le trajet, le calcul, les signalements ou l'heure.
        allowed = numbers(str(TRIP) + str(FAKE_RESULT)) | {"10", "42"}
        for intent, said in [("ask_fare", "ça fait combien ?"), ("ask_eta", "j'arrive à quelle heure ?"),
                             ("ask_transfer", "je descends où ?"), ("ask_nearby_landmark", "où en est mon trajet ?")]:
            reply = self.dialog(FixedNLU(intent)).ask(said, POSITION, trip=TRIP)["reply_text"]
            self.assertLessEqual(numbers(reply), allowed, reply)

    def test_trajet_mal_forme_ignore(self):
        out = self.dialog(FixedNLU("ask_transfer")).ask("je descends où ?", POSITION, trip={"journey": "n'importe quoi"})
        self.assertNotIn("Monte dans", out["reply_text"])

    def test_autre_lieu_choisi_apres_une_hesitation(self):
        # Bug observé : « Gare Sud ou Gare Nord ? » → « Gare Nord » → SIRA partait vers Gare Sud
        planner = Planner()
        first = self.dialog(FakeNLU(), planner).ask("je vais au marché", POSITION)
        self.assertEqual(first["kind"], "question")
        self.dialog(FixedNLU("confirm"), planner).ask("Riviera Palmeraie", POSITION, first["context"])
        self.assertEqual(planner.calls[0]["destination"]["name"], "Riviera Palmeraie")

    def test_oui_douteux_ne_part_pas_au_mauvais_endroit(self):
        planner = Planner()
        first = self.dialog(FakeNLU(), planner).ask("je vais au marché", POSITION)
        out = self.dialog(EntityNLU("confirm", [("DESTINATION", "chez ma tante")]), planner).ask(
            "c'est chez ma tante", POSITION, first["context"])
        self.assertEqual(planner.calls, [])
        self.assertEqual(out["kind"], "question")


class ApiTest(unittest.TestCase):
    def setUp(self):
        self.planner = Planner()
        self.client = TestClient(create_app(nlu=FakeNLU(), planner=self.planner, live=FakeLive()))
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)

    def test_health(self):
        body = self.client.get("/health").json()
        self.assertEqual(body["service"], "sira-voice")
        self.assertTrue(body["components"]["nlu"])

    def test_ask(self):
        body = self.client.post("/voice/ask", json={"text": "je vais au plato", "position": POSITION}).json()
        self.assertIn("Plateau", body["reply_text"])
        self.assertIsNone(body["reply_audio"])

    def test_question_sur_le_trajet_en_cours(self):
        body = self.client.post("/voice/ask", json={"text": "je descends où ?", "position": POSITION, "trip": TRIP}).json()
        self.assertEqual(body["kind"], "info")
        self.assertIn("trajet.arrets", body["sources"])
        self.assertIn("descends vers Plateau", body["reply_text"])
        self.assertGreater(self.client.get("/health").json()["components"]["faq"], 40)

    def test_understand(self):
        body = self.client.post("/voice/understand", json={"text": "je vais au plato"}).json()
        self.assertEqual(body["places"]["destination"]["match"]["canonical"], "Plateau")

    def test_validation_entree(self):
        self.assertEqual(self.client.post("/voice/ask", json={"text": ""}).status_code, 422)
        self.assertEqual(self.client.post("/voice/ask", json={"text": "x", "position": {"lat": 200, "lon": 0}}).status_code, 422)

    def test_audio_vide(self):
        r = self.client.post("/voice/query", files={"audio": ("v.webm", b"", "audio/webm")})
        self.assertEqual(r.status_code, 400)

    def test_page_de_test(self):
        r = self.client.get("/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("Assistant vocal SIRA", r.text)

    def test_reponse_courte_sans_calcul_de_trajet(self):
        class SaidASR:
            def transcribe(self, data):
                return {"text": "J'ai payé deux cents francs, oui", "duration_s": 1.2, "speech_detected": True}
        self.client.app.state.asr = SaidASR()
        body = self.client.post("/voice/answer", files={"audio": ("v.webm", b"abc", "audio/webm")}).json()
        self.assertEqual((body["amount"], body["answer"]), (200, "yes"))
        self.assertEqual(self.planner.calls, [])


class SpeechSettingsTest(unittest.TestCase):
    def test_transcription_rapide(self):
        # Mesuré sur ce PC : liste de 40 lieux (538 caractères) = 11,8 s par phrase ; communes seulement = 6,8 s.
        # La recherche large (beam 5) est gardée : la simple déformait « je quitte Yopougon ».
        from services.voice.app import config
        from services.voice.app.speech import Transcriber
        communes = PlaceResolver(FIXTURES / "gazetteer_test.json").place_names(kinds=("commune",))
        t = Transcriber("small", "cpu", "int8", communes, 30, config.WHISPER_BEAM)
        self.assertEqual(t.beam_size, 5)
        self.assertLess(len(t.prompt), 200)
        self.assertIn("Yopougon", t.prompt)
        self.assertFalse(t.loaded)  # rien n'est chargé tant qu'on ne s'en sert pas (ni dans les tests)

    def test_vitesse_de_lecture(self):
        from services.voice.app import config
        self.assertTrue(0.7 <= config.SPEECH_RATE <= 1.5)


class ShortAnswerTest(unittest.TestCase):
    def test_prix_dit_en_chiffres_ou_en_lettres(self):
        cases = {"500": 500, "J'ai payé 1 000 francs": 1000, "cinq cents": 500, "deux mille cinq cents F": 2500,
                 "c'est un gbaka à deux cents": 200, "quatre-vingt-dix": 90, "3 mille": 3000}
        for said, amount in cases.items():
            self.assertEqual(parse_amount(said), amount, said)

    def test_prix_jamais_devine(self):
        for said in ("je sais pas", "rien", "un", "100000"):
            self.assertIsNone(parse_amount(said), said)

    def test_oui_non(self):
        cases = {"Oui": "yes", "D'accord !": "yes", "ya foye": "yes", "Prends-le": "yes", "Il est toujours là": "yes",
                 "Non merci": "no", "Laisse tomber": "no", "Il n'y a plus rien": "no",
                 "hein ?": None, "non… il est toujours là": None}
        for said, answer in cases.items():
            self.assertEqual(yes_no(said), answer, said)


if __name__ == "__main__":
    unittest.main()
