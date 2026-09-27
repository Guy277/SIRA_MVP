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

from fastapi.testclient import TestClient  # noqa: E402

from services.voice.app import normalize as nz  # noqa: E402
from services.voice.app.dialog import JourneyServiceError, VoiceDialog  # noqa: E402
from services.voice.app.main import create_app  # noqa: E402
from services.voice.app.resolver import Match, PlaceResolver, same_name  # noqa: E402
from services.voice.app.short_answer import parse_amount, yes_no  # noqa: E402


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

    def test_pas_compris_on_fait_repeter_poliment(self):
        out = self.dialog(FixedNLU("navigate_to", 0.2)).ask("euh", POSITION)
        self.assertEqual(out["kind"], "retry")
        self.assertIn("un peu plus fort, s'il te plaît", out["reply_text"])

    def test_trajet_annonce_renvoye(self):
        out = self.dialog(FakeNLU()).ask("je vais au plato", POSITION)
        self.assertEqual(out["kind"], "journeys")
        self.assertEqual(out["chosen_id"], "j1")


class ApiTest(unittest.TestCase):
    def setUp(self):
        self.planner = Planner()
        self.client = TestClient(create_app(nlu=FakeNLU(), planner=self.planner))
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
