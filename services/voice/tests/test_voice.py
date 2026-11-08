"""Tests du service vocal sans les gros modèles : faux NLU (règles), faux moteur, vrai correcteur de lieux.

Lancer : npm run test:voice   (ou  python -m unittest discover -s services/voice/tests -v)
"""
import base64
import io
import json
import os
import re
import sys
import unittest
import wave
from datetime import datetime, timezone
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures"
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # racine du dépôt SIRA
os.environ.setdefault("VOICE_GAZETTEER", str(FIXTURES / "gazetteer_test.json"))
os.environ.setdefault("VOICE_MODELS_DIR", str(FIXTURES / "absent"))
os.environ.setdefault("VOICE_PIPER_MODEL", str(FIXTURES / "absent.onnx"))
os.environ.setdefault("VOICE_PRELOAD", "0")  # les tests n'utilisent pas les gros modèles
os.environ.setdefault("VOICE_PARAKEET_DIR", str(FIXTURES / "absent"))

from fastapi.testclient import TestClient  # noqa: E402

from services.voice.app import normalize as nz  # noqa: E402
from services.voice.app.config import PLACE_MARGIN, PLACE_THRESHOLD, whisper_name  # noqa: E402
from services.voice.app import dialog as dialog_module  # noqa: E402
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


class LieuxComplementsTest(unittest.TestCase):
    """knowledge/lieux_complements.json : lieux ajoutés, coordonnées, variantes et communes exactes."""

    @classmethod
    def setUpClass(cls):
        from services.voice.app.config import LIEUX_COMPLEMENTS
        cls.path = LIEUX_COMPLEMENTS
        cls.data = json.loads(LIEUX_COMPLEMENTS.read_text(encoding="utf-8"))
        cls.r = PlaceResolver(FIXTURES / "gazetteer_test.json", LIEUX_COMPLEMENTS)

    def test_fichier_coherent(self):
        communes = {"Abobo", "Adjamé", "Anyama", "Attécoubé", "Bingerville", "Cocody", "Koumassi", "Marcory", "Plateau",
                    "Port-Bouët", "Songon", "Treichville", "Yopougon"}
        ids = [p["place_id"] for p in self.data["ajouts"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(pid.startswith("PL-C") for pid in ids))  # jamais un identifiant du notebook
        for place in self.data["ajouts"]:  # Grand Abidjan : 13 communes du District + Dabou, Bonoua, Alépé…
            self.assertTrue(-4.5 < place["lon"] < -3.5 and 5.1 < place["lat"] < 5.75, place["canonical"])
            # noms recopiés d'OSM : pas d'espace insécable, sinon elle part dans la réponse de l'app et la voix
            self.assertFalse(any("\xa0" in name for name in [place["canonical"], *place["aliases"]]), place["canonical"])
        self.assertTrue(set(self.data["communes"].values()) <= communes)

    def test_lieux_ajoutes_trouves_avec_coordonnees(self):
        for said, expected in [("black market", "Black Market"), ("huitième tranche", "Angré 8e Tranche"),
                               ("treichville arras", "Treichville Arras"), ("stade houphouët-boigny", "Stade Félix Houphouët-Boigny")]:
            top = self.r.resolve(said)[0]
            self.assertEqual(top.canonical, expected, said)
            self.assertIsNotNone(top.lat)

    def test_commune_exacte_appliquee(self):
        siporex = self.r.places["PL-00053"]
        self.assertEqual(siporex["commune"], self.data["communes"]["PL-00053"])
        self.assertFalse(siporex["needs_review"])

    def test_sans_fichier_rien_ne_change(self):
        plain = PlaceResolver(FIXTURES / "gazetteer_test.json", FIXTURES / "absent.json")
        self.assertEqual(len(plain), 18)


class HorsReseauTest(unittest.TestCase):
    """Communes périphériques du Grand Abidjan (Grand-Bassam, Dabou…) : hors du réseau de transport de SIRA."""

    def setUp(self):
        import tempfile
        from services.voice.app.config import LIEUX_COMPLEMENTS
        data = json.loads(LIEUX_COMPLEMENTS.read_text(encoding="utf-8"))
        # Aucune gare de départ n'est attestée pour Bonoua : le test en simule une (le Plateau du répertoire de test).
        for place in data["ajouts"]:
            if place["canonical"] == "Bonoua":
                place["hors_reseau"]["depart"] = "PL-00009"
        self.tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
        json.dump(data, self.tmp, ensure_ascii=False)
        self.tmp.close()
        self.planner = Planner()
        resolver = PlaceResolver(FIXTURES / "gazetteer_test.json", Path(self.tmp.name))
        self.d = VoiceDialog(FakeNLU(), resolver, PLACE_THRESHOLD, PLACE_MARGIN, 0.5, self.planner)

    def tearDown(self):
        os.unlink(self.tmp.name)

    def test_gare_de_depart_connue(self):
        out = self.d.ask("je vais à bonoua", POSITION)
        self.assertEqual(self.planner.calls[0]["destination"]["name"], "Plateau")  # la gare de départ, pas Bonoua
        self.assertTrue(out["reply_text"].startswith("Bonoua n'est pas encore dans le réseau de SIRA"))
        self.assertIn("400 francs", out["reply_text"])  # le trajet jusqu'à la gare, chiffres du moteur

    def test_sans_gare_connue_rien_n_est_invente(self):
        out = self.d.ask("je vais à dabou", POSITION)
        self.assertEqual(self.planner.calls, [])
        self.assertIn("pas encore dans SIRA", out["reply_text"])

    def test_trajet_dans_le_reseau_inchange(self):
        out = self.d.ask("je vais au plato", POSITION)
        self.assertEqual(self.planner.calls[0]["destination"]["name"], "Plateau")
        self.assertNotIn("réseau de SIRA", out["reply_text"])


class LieuxDuVoyageurTest(unittest.TestCase):
    """Maison, Travail et lieux nommés dans l'application : « emmène-moi à la maison » part de son adresse."""

    PLACES = [
        {"kind": "home", "label": "Maison", "title": "Riviera Palmeraie, rue des Jardins", "lat": 5.3631, "lon": -3.9594},
        {"kind": "work", "label": "Travail", "title": "Orange Digital Center", "lat": 5.3260, "lon": -4.0198},
        {"kind": "custom", "label": "Chez Maman", "title": "Yopougon Niangon", "lat": 5.3226, "lon": -4.0874},
        {"kind": "custom", "label": "Lyon", "title": "Hors d'Abidjan", "lat": 45.76, "lon": 4.83},  # ignoré
    ]

    def setUp(self):
        self.planner = Planner()
        self.d = VoiceDialog(FakeNLU(), PlaceResolver(FIXTURES / "gazetteer_test.json"), PLACE_THRESHOLD, PLACE_MARGIN, 0.5,
                             self.planner)

    def test_maison_et_travail(self):
        self.d.ask("je rentre à la maison", POSITION, places=self.PLACES)
        self.d.ask("emmène-moi au boulot", POSITION, places=self.PLACES)
        self.assertEqual([c["destination"]["name"] for c in self.planner.calls],
                         ["Riviera Palmeraie, rue des Jardins", "Orange Digital Center"])
        self.assertEqual(self.planner.calls[0]["destination"]["lat"], 5.3631)

    def test_lieu_nomme_par_le_voyageur(self):
        self.d.ask("je vais chez maman", POSITION, places=self.PLACES)
        self.assertEqual(self.planner.calls[0]["destination"]["name"], "Yopougon Niangon")

    def test_le_modele_n_entend_qu_une_partie_du_nom(self):
        # Vu avec CamemBERT : dans « je vais chez tantie », seul « tantie » est reconnu comme lieu.
        class PartNLU:
            def predict(self, text):
                start = text.index("tantie")
                return "navigate_to", 0.9, [{"label": "DESTINATION", "start": start, "end": start + 6, "text": "tantie", "score": 0.9}]
        d = VoiceDialog(PartNLU(), PlaceResolver(FIXTURES / "gazetteer_test.json"), PLACE_THRESHOLD, PLACE_MARGIN, 0.5, self.planner)
        places = [*self.PLACES, {"kind": "custom", "label": "Chez Tantie", "title": "Niangon sud", "lat": 5.3164, "lon": -4.0937}]
        d.ask("je vais chez tantie", POSITION, places=places)
        self.assertEqual(self.planner.calls[0]["destination"]["name"], "Niangon sud")

    def test_reponse_a_tu_veux_aller_ou(self):
        out = self.d.ask("je veux un trajet", POSITION, places=self.PLACES)
        self.d.ask("à la maison", POSITION, out["context"], places=self.PLACES)
        self.assertEqual(self.planner.calls[-1]["destination"]["name"], "Riviera Palmeraie, rue des Jardins")

    def test_sans_lieux_rien_ne_change(self):
        self.d.ask("je rentre à la maison", POSITION)
        self.d.ask("je vais au plato", POSITION, places=self.PLACES)
        self.assertEqual([c["destination"]["name"] for c in self.planner.calls], ["Plateau"])

    def test_lieux_jamais_gardes_d_une_question_a_l_autre(self):
        self.d.ask("je rentre à la maison", POSITION, places=self.PLACES)
        self.d.ask("je rentre à la maison", POSITION)
        self.assertEqual(len(self.planner.calls), 1)

    def test_lieux_hors_abidjan_ou_mal_formes_ignores(self):
        from services.voice.app.personal import clean_places
        kept = clean_places([*self.PLACES, "Maison", {"kind": "home", "lat": "x", "lon": 1}, {"label": "Ab", "title": "A", "lat": 5.3, "lon": -4}])
        self.assertEqual([p["label"] for p in kept], ["Maison", "Travail", "Chez Maman"])


class ParakeetPuisWhisperTest(unittest.TestCase):
    """Parakeet (≈ 0,5 s) d'abord ; Whisper (3 à 4,5 s) seulement quand Parakeet n'est pas sûr du lieu ou de l'intention."""

    class Ear:
        def __init__(self, text):
            self.text, self.calls = text, 0

        def transcribe(self, audio):
            self.calls += 1
            return {"text": self.text, "duration_s": 1.0, "speech_detected": bool(self.text), "avg_logprob": None}

    def state(self, fast_text, slow_text="je vais au plato"):
        state = type("State", (), {})()
        state.fast_asr, state.asr = self.Ear(fast_text), self.Ear(slow_text)
        return state

    def test_parakeet_suffit_quand_c_est_sur(self):
        from services.voice.app.main import hear
        state = self.state("je vais au plato")
        transcript = hear(state, b"audio", lambda text: False)
        self.assertEqual((transcript["moteur"], state.asr.calls), ("parakeet", 0))

    def test_whisper_reecoute_quand_ce_n_est_pas_sur(self):
        from services.voice.app.main import hear
        state = self.state("je vais à jami")
        transcript = hear(state, b"audio", lambda text: True)
        self.assertEqual((transcript["moteur"], transcript["text"], transcript["secours"]), ("whisper", "je vais au plato", True))
        self.assertIn("parakeet_s", transcript)

    def test_whisper_quand_parakeet_n_entend_rien_ou_manque(self):
        from services.voice.app.main import hear
        self.assertEqual(hear(self.state(""), b"audio", lambda text: False)["moteur"], "whisper")
        state = self.state("x")
        state.fast_asr = None  # Parakeet pas installé : Whisper seul, sans « secours »
        transcript = hear(state, b"audio", lambda text: False)
        self.assertEqual((transcript["moteur"], transcript["secours"]), ("whisper", False))

    def test_lieu_pas_sur_dans_la_phrase(self):
        d = VoiceDialog(FakeNLU(), PlaceResolver(FIXTURES / "gazetteer_test.json"), PLACE_THRESHOLD, PLACE_MARGIN, 0.5, Planner())
        self.assertTrue(d.needs_better_hearing("je vais à jamizou", POSITION))  # lieu inconnu : Whisper réécoute
        self.assertFalse(d.needs_better_hearing("je vais au plato", POSITION))
        places = [{"kind": "home", "label": "Maison", "title": "Riviera Palmeraie", "lat": 5.3631, "lon": -3.9594}]
        self.assertFalse(d.needs_better_hearing("je rentre à la maison", POSITION, places))  # lieu du voyageur : sûr

    def test_api_choisit_le_moteur(self):
        planner = Planner()
        with TestClient(create_app(nlu=FakeNLU(), planner=planner, live=FakeLive())) as client:
            client.app.state.fast_asr, client.app.state.asr = self.Ear("je vais au plato"), self.Ear("je vais au plato")
            body = client.post("/voice/query", files={"audio": ("v.webm", b"abc", "audio/webm")}, data={"speak": "false", "lat": "5.3467", "lon": "-3.9951"}).json()
            self.assertEqual((body["transcript"]["moteur"], client.app.state.asr.calls), ("parakeet", 0))
            client.app.state.fast_asr = self.Ear("je vais à jamizou")
            body = client.post("/voice/query", files={"audio": ("v.webm", b"abc", "audio/webm")}, data={"speak": "false", "lat": "5.3467", "lon": "-3.9951"}).json()
            self.assertEqual(body["transcript"]["moteur"], "whisper")
            self.assertEqual(planner.calls[-1]["destination"]["name"], "Plateau")


class WhisperQuiSEmballeTest(unittest.TestCase):
    """Whisper a mis 23 s et 26 s sur deux phrases (2026-10-25) : il relançait le décodage et répétait les mots."""

    class Ear:
        def __init__(self, result):
            self.result, self.calls = result, 0

        def transcribe(self, audio):
            self.calls += 1
            return {"duration_s": 1.0, "speech_detected": True, "avg_logprob": None, "repetitive": False, **self.result}

    def state(self, fast_text, slow):
        state = type("State", (), {})()
        state.fast_asr = self.Ear({"text": fast_text})
        state.asr = self.Ear(slow)
        return state

    def test_boucle_reconnue(self):
        from services.voice.app.speech import collapse_repeats, is_repetitive
        self.assertTrue(is_repetitive("je vais à Adjamé Adjamé Adjamé Adjamé Adjamé Adjamé Adjamé"))
        self.assertTrue(is_repetitive("je descends à la gare je descends à la gare je descends à la gare je descends à la gare"))
        self.assertFalse(is_repetitive("Je quitte Yopougon, je vais au Plateau en gbaka avec deux cents francs."))
        self.assertFalse(is_repetitive("Tu veux dire Riviera 2 ou Riviera 3 ?"))
        self.assertEqual(collapse_repeats("je vais au Plateau Plateau Plateau Plateau"), "je vais au Plateau")

    def test_parakeet_gardé_quand_whisper_boucle(self):
        from services.voice.app.main import hear
        state = self.state("je vais à jami", {"text": "je vais à Adjamé", "repetitive": True})
        transcript = hear(state, b"audio", lambda text: True)
        self.assertEqual((transcript["moteur"], transcript["text"], transcript["whisper_ecarte"]), ("parakeet", "je vais à jami", True))

    def test_parakeet_gardé_quand_whisper_n_entend_rien(self):
        from services.voice.app.main import hear
        transcript = hear(self.state("je vais à jami", {"text": "", "speech_detected": False}), b"audio", lambda text: True)
        self.assertEqual((transcript["moteur"], transcript["text"]), ("parakeet", "je vais à jami"))

    def test_whisper_gardé_quand_il_va_bien(self):
        from services.voice.app.main import hear
        transcript = hear(self.state("je vais à jami", {"text": "je vais à Adjamé"}), b"audio", lambda text: True)
        self.assertEqual((transcript["moteur"], transcript["text"]), ("whisper", "je vais à Adjamé"))

    def test_whisper_borné(self):
        """Une seule température et un plafond de jetons proportionnel à la durée de la phrase."""
        import numpy as np
        from services.voice.app.speech import Transcriber
        seen = {}

        class Model:
            def transcribe(self, samples, **options):
                seen.update(options)
                segment = type("Segment", (), {"text": " Adjamé Adjamé Adjamé Adjamé Adjamé Adjamé Adjamé Adjamé", "avg_logprob": -0.2})()
                return [segment], None

        t = Transcriber("small", "cpu", "int8", ["Adjamé"], 30.0, beam_size=5, temperature=0.0, tokens_per_second=8.0)
        t._model = Model()
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(16000)
            w.writeframes((np.zeros(16000 * 3)).astype("<i2").tobytes())
        result = t.transcribe(buffer.getvalue())
        self.assertEqual(seen["temperature"], 0.0)
        self.assertEqual(seen["max_new_tokens"], 16 + 24)  # 3 s d'audio
        self.assertEqual(t.max_tokens(60), 224)
        self.assertTrue(result["repetitive"])
        self.assertEqual(result["text"], "Adjamé")


class LLMLocalTest(unittest.TestCase):
    """Ministral 3 3B (llm.py) : appelé seulement quand les règles ne savent pas, et jamais pour donner un chiffre."""

    class NLU:
        def __init__(self, intent="navigate_to", confidence=0.95):
            self.intent, self.confidence = intent, confidence

        def predict(self, text):
            return self.intent, self.confidence, []

    class LLM:
        def __init__(self, decision):
            self.decision, self.calls = decision, []

        def decide(self, text, saved_places=None, in_trip=False):
            self.calls.append({"text": text, "places": saved_places, "in_trip": in_trip})
            return self.decision

    class Knowledge:
        def search(self, text, k=4):
            from services.voice.app.knowledge import Hit, Passage
            if "coulé" in text.lower():
                return [Hit(Passage("sira-coule", ["c'est quoi le coulé"], "Le coulé, c'est l'option la moins chère."), 0.95)]
            return []

    def dialog(self, nlu, decision, planner=None, live=None):
        from services.voice.app.llm import Decision
        llm = self.LLM(decision if decision is None or isinstance(decision, Decision) else Decision(**decision))
        resolver = PlaceResolver(FIXTURES / "gazetteer_test.json")
        planner = planner or Planner()
        # Avec live : les signalements des voyageurs (réponse « ça bouche à … ? ») sont branchés.
        trips = TripAnswers(resolver, planner, live.impact, live.reports, now=lambda: NOW) if live else None
        d = VoiceDialog(nlu, resolver, PLACE_THRESHOLD, PLACE_MARGIN, 0.5, planner, self.Knowledge(), trips, llm=llm)
        return d, llm

    def test_pas_de_llm_quand_les_regles_suffisent(self):
        d, llm = self.dialog(FakeNLU(), {"tool": "chercher_info", "args": {}})
        reply = d.ask("Je vais au Plateau", POSITION)
        self.assertEqual((reply["kind"], llm.calls), ("journeys", []))
        self.assertNotIn("llm", reply["sources"])

    def test_phrase_mal_classee_le_llm_calcule_le_trajet(self):
        planner = Planner()
        d, llm = self.dialog(self.NLU("navigate_to", 0.3), {"tool": "calculer_trajet",
                             "args": {"destination": "Adjamé", "preference": "moins_cher", "budget_fcfa": 500, "modes_exclus": ["taxi"]}}, planner)
        reply = d.ask("euh on part comment pour adjamé là", POSITION)
        self.assertEqual(len(llm.calls), 1)
        request = planner.calls[0]
        self.assertEqual((request["destination"]["name"], request["preference"], request["budget"], request["constraints"]["excludedModes"]),
                         ("Adjamé", "cheap", 500, ["taxi"]))
        self.assertEqual(request["origin"]["name"], POSITION["name"])  # départ non dit : la position, jamais supposée
        self.assertEqual(reply["kind"], "journeys")
        self.assertIn("llm", reply["sources"])
        self.assertIn("sira-more", reply["sources"])  # les chiffres viennent du moteur
        self.assertEqual(reply["llm"]["outil"], "calculer_trajet")

    def test_lieu_du_llm_inconnu_on_redemande_sans_calculer(self):
        planner = Planner()
        d, _ = self.dialog(self.NLU("out_of_scope", 0.9), {"tool": "calculer_trajet", "args": {"destination": "Zorglubville"}}, planner)
        reply = d.ask("emmène moi à zorglubville", POSITION)
        self.assertEqual(planner.calls, [])
        self.assertEqual(reply["kind"], "retry")
        self.assertIn("Zorglubville", reply["reply_text"])

    def test_lieu_du_voyageur_par_le_llm(self):
        planner = Planner()
        d, llm = self.dialog(self.NLU("out_of_scope", 0.9), {"tool": "calculer_trajet", "args": {"destination": "Maison"}}, planner)
        places = [{"kind": "home", "label": "Maison", "title": "Riviera Palmeraie", "lat": 5.37, "lon": -3.96}]
        d.ask("je rentre", POSITION, places=places)
        self.assertEqual(planner.calls[0]["destination"]["name"], "Riviera Palmeraie")
        self.assertEqual(llm.calls[0]["places"][0]["title"], "Riviera Palmeraie")

    def test_un_chiffre_sans_outil_est_refuse(self):
        d, _ = self.dialog(self.NLU("out_of_scope", 0.9), {"tool": None, "text": "Le gbaka coûte 300 francs."})
        reply = d.ask("le gbaka c'est combien", POSITION)
        self.assertNotIn("300", reply["reply_text"])
        self.assertNotIn("llm", reply["sources"])

    def test_phrase_sans_chiffre_et_llm_absent(self):
        d, _ = self.dialog(self.NLU("out_of_scope", 0.9), {"tool": None, "text": "Je m'occupe seulement de tes trajets à Abidjan."})
        self.assertEqual(d.ask("raconte une blague", POSITION)["reply_text"], "Je m'occupe seulement de tes trajets à Abidjan.")
        d, _ = self.dialog(self.NLU("out_of_scope", 0.9), None)  # LLM arrêté ou trop lent : la réponse des règles
        self.assertIn("SIRA", d.ask("raconte une blague", POSITION)["reply_text"])

    def test_definition_toujours_par_la_base(self):
        d, _ = self.dialog(self.NLU("out_of_scope", 0.9), {"tool": "chercher_info", "args": {"question": "c'est quoi le coulé"}})
        self.assertEqual(d.ask("le coulé là c'est quoi", POSITION)["reply_text"], "Le coulé, c'est l'option la moins chère.")
        d, _ = self.dialog(self.NLU("out_of_scope", 0.9), {"tool": "chercher_info", "args": {"question": "horaires de la piscine"}})
        self.assertEqual(d.ask("la piscine ouvre quand", POSITION)["reply_text"], dialog_module.NO_INFO)

    def test_trafic_douteux_sans_lieu_passe_par_le_llm(self):
        # Vu le 2026-11-08 : « les wôrô roulent jusqu'à quelle heure ? » → trafic à 0,63 → « Dis-moi l'endroit ».
        d, llm = self.dialog(self.NLU("traffic_status", 0.63), {"tool": "chercher_info", "args": {"question": "horaires des wôrô le soir"}})
        reply = d.ask("les wôrô roulent jusqu'à quelle heure le soir", POSITION)
        self.assertEqual(len(llm.calls), 1)
        self.assertEqual(reply["reply_text"], dialog_module.NO_INFO)
        self.assertIn("llm", reply["sources"])

    def test_vraie_question_de_trafic_sans_llm(self):
        # Sûr de lui, sans lieu : la réponse rapide des règles, sans attendre le LLM.
        d, llm = self.dialog(self.NLU("traffic_status", 0.9), {"tool": "chercher_info", "args": {}})
        reply = d.ask("ça bouche ?", POSITION)
        self.assertEqual(llm.calls, [])
        self.assertEqual(reply["reply_text"], dialog_module.OTHER_REPLIES["traffic_status"])

    def test_lieu_devine_pas_de_trafic_mais_le_llm(self):
        # Vu le 2026-11-08 : « ça marche comment votre affaire de coulé là » → trafic à 0,48, « Adjamé » deviné
        # → « Aucun incident signalé vers Adjamé ». Avec une intention douteuse, le trafic d'un lieu ne répond plus.
        d, llm = self.dialog(EntityNLU("traffic_status", [("PLACE", "Adjamé")], 0.48),
                             {"tool": "chercher_info", "args": {"question": "c'est quoi le coulé"}}, live=FakeLive())
        reply = d.ask("ça marche comment votre affaire là vers Adjamé", POSITION)
        self.assertEqual(len(llm.calls), 1)
        self.assertEqual(reply["reply_text"], "Le coulé, c'est l'option la moins chère.")

    def test_bouchon_a_un_lieu_sur_reste_aux_regles(self):
        d, llm = self.dialog(EntityNLU("traffic_status", [("PLACE", "Adjamé")], 0.9), {"tool": "chercher_info", "args": {}}, live=FakeLive())
        reply = d.ask("ça bouche à Adjamé ?", POSITION)
        self.assertEqual(llm.calls, [])
        self.assertIn("Adjamé", reply["reply_text"])
        self.assertNotIn("llm", reply["sources"])

    def test_trajet_en_cours_et_signalement(self):
        d, llm = self.dialog(self.NLU("out_of_scope", 0.9), {"tool": "trajet_en_cours", "args": {"sujet": "arret"}})
        self.assertEqual(d.ask("je descends où", POSITION)["reply_text"], dialog_module.NO_TRIP)
        self.assertFalse(llm.calls[0]["in_trip"])
        d, _ = self.dialog(self.NLU("out_of_scope", 0.9), {"tool": "signaler_incident", "args": {"type": "inondation", "lieu": "Adjamé"}})
        reply = d.ask("y a l'eau partout à adjamé", POSITION)
        self.assertEqual(reply["understanding"]["intent"], "report_incident")
        self.assertTrue(any(e["label"] == "INCIDENT_TYPE" and e["text"] == "inondation" for e in reply["understanding"]["entities"]))
        self.assertIn("Adjamé", reply["reply_text"])

    def test_client_llama_server(self):
        from services.voice.app.llm import LocalLLM, SYSTEM
        sent = {}

        def post(url, payload, timeout):
            sent.update(url=url, payload=payload, timeout=timeout)
            return {"choices": [{"message": {"tool_calls": [{"function": {"name": "calculer_trajet", "arguments": "{\"destination\": \"Adjamé\"}"}}]}}]}

        llm = LocalLLM("http://127.0.0.1:8300/", 12, post=post)
        decision = llm.decide("je vais à adjamé", [{"kind": "home", "label": "Maison", "title": "Riviera Palmeraie", "lat": 5.3, "lon": -4.0}])
        self.assertEqual((decision.tool, decision.args), ("calculer_trajet", {"destination": "Adjamé"}))
        self.assertEqual((sent["url"], sent["timeout"]), ("http://127.0.0.1:8300/v1/chat/completions", 12))
        messages = sent["payload"]["messages"]
        # Un seul message system, puis la question : le modèle de Ministral refuse un second message system (500).
        self.assertEqual([m["role"] for m in messages], ["system", "user"])
        self.assertTrue(messages[0]["content"].startswith(SYSTEM))  # partie fixe d'abord : gardée en cache par llama-server
        self.assertIn("Riviera Palmeraie", messages[0]["content"])
        self.assertTrue(sent["payload"]["cache_prompt"])
        bad = LocalLLM("http://x", post=lambda *a: {"choices": [{"message": {"tool_calls": [{"function": {"name": "rm_rf", "arguments": "{}"}}]}}]})
        self.assertIsNone(bad.decide("x"))

        def down(*a):
            raise TimeoutError("trop lent")
        self.assertIsNone(LocalLLM("http://x", post=down).decide("x"))


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
        self.assertIsNone(self.r.decide(matches, PLACE_THRESHOLD, PLACE_MARGIN))
        self.assertEqual(self.top("yopougon vingt sept"), "Yopougon")  # « vingt sept » reste 27, pas « 20 sept »

    def test_le_terminus_du_quartier_est_le_meme_endroit(self):
        # Bug observé : « Tu veux dire Williamsville ou Terminus Williamsville ? » pour les lieux les plus demandés.
        from services.voice.app.resolver import same_place
        quartier = Match("Q", "Williamsville", "quartier", "Adjamé", 5.3600, -4.0200, 102)
        self.assertTrue(same_place(quartier, Match("S", "Terminus Williamsville", "stop", "Adjamé", 5.3640, -4.0200, 100)))  # 450 m
        self.assertTrue(same_place(Match("A", "Akouédo", "quartier", "Cocody", 5.35, -3.94, 102),
                                   Match("B", "Akouédo (Cocody)", "stop", "Cocody", 5.355, -3.94, 100)))
        # Même nom mais loin (deux Sicogi), ou autre nom : la question reste.
        self.assertFalse(same_place(Match("K", "Sicogi (Koumassi)", "stop", "Koumassi", 5.29, -3.95, 100),
                                    Match("Y", "Sicogi (Yopougon)", "stop", "Yopougon", 5.34, -4.08, 100)))
        self.assertFalse(same_place(quartier, Match("S", "Terminus Gesco", "stop", "Yopougon", 5.3600, -4.0210, 100)))

    def test_meme_lieu_mots_dans_un_autre_ordre(self):
        # Bug observé en audio : « Tu veux dire Adjamé 220 Logements ou 220 Lgts Adjamé ? » (deux noms du même lieu)
        self.assertTrue(same_name("Adjamé 220 Logements", "220 Lgts Adjamé"))
        self.assertFalse(same_name("Marché (Abobo)", "Marché (Attécoubé)"))
        a = Match("PL-00018", "Adjamé 220 Logements", "quartier", "Adjamé", 5.35174, -4.016983, 92.1)
        b = Match("PL-01234", "220 Lgts Adjamé", "stop", "Adjamé", 5.3521, -4.0172, 90.1)
        self.assertIsNone(self.r.decide([a, b], PLACE_THRESHOLD, PLACE_MARGIN))

    def test_decisions(self):
        self.assertIsNone(self.r.decide(self.r.resolve("plato"), PLACE_THRESHOLD, PLACE_MARGIN))
        self.assertEqual(self.r.decide(self.r.resolve("marché"), PLACE_THRESHOLD, PLACE_MARGIN), "ambiguous_place")
        self.assertEqual(self.r.decide(self.r.resolve("orange digital center"), PLACE_THRESHOLD, PLACE_MARGIN), "place_without_coordinates")
        self.assertEqual(self.r.decide([], PLACE_THRESHOLD, PLACE_MARGIN), "unresolvable_place")
        # Bug observé sur le vrai répertoire : une ville hors d'Abidjan trouvait un voisin (« Gagnoa » → Gare Nord, 69)
        # et le trajet partait sans question.
        matches = self.r.resolve("Gagnoa")
        self.assertEqual(matches[0].canonical, "Gare Nord")
        self.assertEqual(self.r.decide(matches, PLACE_THRESHOLD, PLACE_MARGIN), "low_place_confidence")


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
        self.d = VoiceDialog(FakeNLU(), PlaceResolver(FIXTURES / "gazetteer_test.json"), PLACE_THRESHOLD, PLACE_MARGIN, 0.5, self.planner)

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
        d = VoiceDialog(FakeNLU(), PlaceResolver(FIXTURES / "gazetteer_test.json"), PLACE_THRESHOLD, PLACE_MARGIN, 0.5,
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
        d = VoiceDialog(FakeNLU(), PlaceResolver(FIXTURES / "gazetteer_test.json"), PLACE_THRESHOLD, PLACE_MARGIN, 0.5, Planner(result))
        reply = d.ask("le gbaka pour anyama ça fait combien", POSITION)["reply_text"]
        self.assertIn("environ 800 francs", reply)
        self.assertIn("le gbaka", reply)
        self.assertNotIn("9900", reply)

    def test_mode_demande_introuvable(self):
        d = VoiceDialog(FakeNLU(), PlaceResolver(FIXTURES / "gazetteer_test.json"), PLACE_THRESHOLD, PLACE_MARGIN, 0.5,
                        Planner({"recommended_id": "j2", "journeys": [FAKE_RESULT["journeys"][1]]}))
        reply = d.ask("le gbaka pour plato ça fait combien", POSITION)["reply_text"]
        self.assertTrue(reply.startswith("Je n'ai pas trouvé de trajet en gbaka."))
        self.assertIn("3000 francs", reply)  # l'autre trajet est annoncé honnêtement, avec le chiffre du moteur

    def test_reponse_sans_jargon(self):
        # Bugs observés : « dont 0 minutes à pied » et le libellé technique « Option fast » lu à voix haute
        d = VoiceDialog(FakeNLU(), PlaceResolver(FIXTURES / "gazetteer_test.json"), PLACE_THRESHOLD, PLACE_MARGIN, 0.5, Planner(
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
        d = VoiceDialog(FakeNLU(), PlaceResolver(FIXTURES / "gazetteer_test.json"), PLACE_THRESHOLD, PLACE_MARGIN, 0.5, Planner(
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
        return VoiceDialog(nlu, PlaceResolver(FIXTURES / "gazetteer_test.json"), PLACE_THRESHOLD, PLACE_MARGIN, 0.5, planner or Planner())

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
        return VoiceDialog(nlu, resolver, PLACE_THRESHOLD, PLACE_MARGIN, 0.5, planner, KNOWLEDGE, trips)

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

    def test_une_seule_voix_pierre(self):
        # La seule voix de SIRA : pierre (homme, locuteur 1 du modèle upmc). Plus de voix femme ni de choix de voix.
        from services.voice.app import config
        # Les tests remplacent le fichier de voix (VOICE_PIPER_MODEL) : on vérifie la valeur par défaut écrite dans la config.
        source = Path(config.__file__).read_text(encoding="utf-8")
        self.assertIn('"fr_FR-upmc-medium.onnx"', source)
        self.assertNotIn("siwis", source)
        self.assertEqual(config.PIPER_SPEAKER, 1)
        self.assertFalse(hasattr(self.client.app.state, "voices"))
        tts = self.client.get("/health").json()["components"]["tts"]
        self.assertEqual((tts["voice"], tts["speaker"]), (config.PIPER_VOICE.name, 1))

        class FakeVoice:
            available, said = True, []

            def synthesize(self, text):
                self.said.append(text)
                return b"pierre"
        self.client.app.state.tts = FakeVoice()
        # Une ancienne appli qui demande encore « femme » : la demande passe, et c'est pierre qui parle.
        r = self.client.post("/voice/tts", json={"text": "Akwaba", "voice": "femme"})
        self.assertEqual((r.status_code, r.content, FakeVoice.said), (200, b"pierre", ["Akwaba"]))

    def test_voix_envoyee_en_mp3(self):
        # 9 fois plus léger que le WAV : la voix arrive vite même en 3G (mesuré : 47 Ko au lieu de 411 Ko pour 9 s).
        import io
        import math
        import wave as wavemod

        buffer = io.BytesIO()
        with wavemod.open(buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(22050)
            wav.writeframes(b"".join(int(8000 * math.sin(i / 10)).to_bytes(2, "little", signed=True) for i in range(22050)))
        wav_bytes = buffer.getvalue()

        class WavVoice:
            available = True

            def synthesize(self, text):
                return wav_bytes
        self.client.app.state.tts = WavVoice()
        r = self.client.post("/voice/tts", json={"text": "Akwaba"})
        self.assertEqual(r.headers["content-type"], "audio/mpeg")
        self.assertTrue(r.content[:3] == b"ID3" or r.content[0] == 0xFF)
        self.assertLess(len(r.content), len(wav_bytes) / 4)
        body = self.client.post("/voice/ask", json={"text": "je vais au plato", "position": POSITION, "speak": True}).json()
        self.assertEqual(body["reply_audio"]["mime"], "audio/mpeg")

    def test_reponse_courte_sans_calcul_de_trajet(self):
        class SaidASR:
            def transcribe(self, data):
                return {"text": "J'ai payé deux cents francs, oui", "duration_s": 1.2, "speech_detected": True}
        self.client.app.state.asr = SaidASR()
        body = self.client.post("/voice/answer", files={"audio": ("v.webm", b"abc", "audio/webm")}).json()
        self.assertEqual((body["amount"], body["answer"]), (200, "yes"))
        self.assertEqual(self.planner.calls, [])


class SpeechSettingsTest(unittest.TestCase):
    def test_whisper_affine_par_defaut_s_il_est_installe(self):
        # sira-small-ft n'est pas dans Git : une machine qui ne l'a pas garde small ; un choix explicite gagne toujours.
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            whisper_dir = Path(folder)
            self.assertEqual(whisper_name({}, whisper_dir), "small")
            (whisper_dir / "sira-small-ft").mkdir()
            self.assertEqual(whisper_name({}, whisper_dir), "small")  # dossier sans model.bin : incomplet
            (whisper_dir / "sira-small-ft" / "model.bin").write_bytes(b"")
            self.assertEqual(whisper_name({}, whisper_dir), "sira-small-ft")
            self.assertEqual(whisper_name({"VOICE_WHISPER_MODEL": ""}, whisper_dir), "sira-small-ft")  # compose.yaml
            self.assertEqual(whisper_name({"VOICE_WHISPER_MODEL": "small"}, whisper_dir), "small")

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

    def test_prompt_garde_les_communes_d_abidjan(self):
        # Les lieux hors réseau (Dabou, Alépé…) chassaient Yopougon et Treichville du prompt (coupé à 15 noms).
        from services.voice.app import config
        from services.voice.app.speech import Transcriber
        gazetteer = config.LOCAL_MODELS / "sira_models_v0.4" / "gazetteer_v0.4.json"  # le vrai, pas celui des tests
        if not gazetteer.exists():
            self.skipTest("répertoire de lieux absent")
        resolver = PlaceResolver(gazetteer, config.LIEUX_COMPLEMENTS)
        t = Transcriber("small", "cpu", "int8", resolver.place_names(kinds=("commune",)), 30)
        for commune in ("Yopougon", "Treichville", "Port-Bouët", "Songon"):
            self.assertIn(commune, t.prompt)
        self.assertNotIn("Dabou", t.prompt)

    def test_vitesse_de_lecture(self):
        from services.voice.app import config
        self.assertTrue(0.7 <= config.SPEECH_RATE <= 1.5)

    def test_intonation_reguliere_choisie_a_l_ecoute(self):
        # Réglage « D » choisi le 2026-10-25 : plus régulier que les valeurs du modèle (0,667 / 0,8).
        from services.voice.app import config
        self.assertEqual((config.NOISE_SCALE, config.NOISE_W), (0.5, 0.6))
        app = create_app(nlu=FakeNLU(), planner=Planner(), live=FakeLive())
        with TestClient(app):
            pierre = app.state.tts
            self.assertEqual((pierre.noise_scale, pierre.noise_w, pierre.speaker_id), (0.5, 0.6, 1))


class PhraseParPhraseTest(unittest.TestCase):
    """SIRA commence à parler dès que sa première phrase est prête (mesuré : 0,5 s au lieu de 3,4 s pour un trajet)."""

    class CountingVoice:
        available, loaded = True, True

        def __init__(self):
            self.said = []

        def warm(self):
            pass

        def synthesize(self, text):
            self.said.append(text)
            return f"voix:{text}".encode()

    def test_decoupe_en_phrases(self):
        from services.voice.app.speech import split_sentences
        text = ("Le plus rapide pour aller à Adjamé : le gbaka, puis le wôrô-wôrô. 500 francs, 35 minutes. "
                "Il y a 2 autres options sur l'écran.")
        self.assertEqual(split_sentences(text), ["Le plus rapide pour aller à Adjamé : le gbaka, puis le wôrô-wôrô.",
                                                 "500 francs, 35 minutes.", "Il y a 2 autres options sur l'écran."])
        # Les deux-points ne coupent pas ; une question reste entière ; rien à dire = aucune phrase.
        self.assertEqual(split_sentences("Dis par exemple : je vais au Plateau."), ["Dis par exemple : je vais au Plateau."])
        self.assertEqual(split_sentences("Tu peux répéter, s'il te plaît ? Dis-moi où."), ["Tu peux répéter, s'il te plaît ?", "Dis-moi où."])
        self.assertEqual(split_sentences("  "), [])

    def test_cache_produit_chaque_phrase_une_fois(self):
        from services.voice.app.speech import SpeechUnavailable, SpokenCache
        made, fail = [], {"Panne."}

        def produce(text):
            made.append(text)
            if text in fail:
                raise SpeechUnavailable("voix absente")
            return text.encode(), "audio/wav"
        cache = SpokenCache(produce, size=3)
        cache.prepare(["Une.", "Deux."])
        self.assertEqual(cache.get("Deux."), (b"Deux.", "audio/wav"))  # attend la préparation, sans refaire
        self.assertEqual(cache.get(" Une. "), (b"Une.", "audio/wav"))
        self.assertEqual(made, ["Une.", "Deux."])
        with self.assertRaises(SpeechUnavailable):
            cache.get("Panne.")
        fail.clear()
        self.assertEqual(cache.get("Panne."), (b"Panne.", "audio/wav"))  # une panne n'est pas gardée : on réessaie
        cache.get("Trois.")
        self.assertEqual(len(cache), 3)  # les plus anciennes phrases sortent

    def test_premiere_phrase_envoyee_la_suite_preparee(self):
        app = create_app(nlu=FakeNLU(), planner=Planner(), live=FakeLive())
        with TestClient(app) as client:
            voice = app.state.tts = self.CountingVoice()
            body = client.post("/voice/ask", json={"text": "je vais au plato", "position": POSITION, "speak": True}).json()
            parts = body["reply_parts"]
            self.assertGreater(len(parts), 1)
            self.assertEqual(" ".join(parts), body["reply_text"])
            self.assertEqual(base64.b64decode(body["reply_audio"]["base64"]), f"voix:{parts[0]}".encode())
            # L'application demande la suite : elle était déjà en préparation, Piper ne la refait pas.
            for part in parts[1:]:
                r = client.post("/voice/tts", json={"text": part})
                self.assertEqual(r.content, f"voix:{part}".encode())
            self.assertEqual(sorted(voice.said), sorted(parts))

    def test_phrases_fixes_pretes_au_demarrage(self):
        from services.voice.app.dialog import FIXED_REPLIES, NOTHING_HEARD, OTHER_REPLIES
        from services.voice.app.main import warm_speech
        self.assertIn(OTHER_REPLIES["voice_help"], FIXED_REPLIES)
        self.assertFalse(any("{" in reply for reply in FIXED_REPLIES))
        app = create_app(nlu=FakeNLU(), planner=Planner(), live=FakeLive())
        with TestClient(app) as client:
            voice = app.state.tts = self.CountingVoice()
            app.state.fast_asr, app.state.asr = None, type("NoASR", (), {"loaded": False, "warm": lambda self: None})()
            warm_speech(app.state)
            client.post("/voice/tts", json={"text": NOTHING_HEARD})
            self.assertEqual(voice.said.count(NOTHING_HEARD), 1)  # préparée au démarrage, pas refaite
            self.assertGreaterEqual(len(app.state.spoken), len(FIXED_REPLIES))


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
