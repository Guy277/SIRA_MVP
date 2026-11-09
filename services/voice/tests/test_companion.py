"""« Discuter avec SIRA » en compagnon (services/voice/app/companion.py, docs/assistant-compagnon.md).

Lancer : python -m unittest services.voice.tests.test_companion
"""
import json
import unittest

from fastapi.testclient import TestClient

from services.voice.tests.test_voice import (  # noqa: F401 (prépare l'environnement de test)
    FIXTURES, POSITION, FakeLive, FakeNLU, Planner,
)
from services.voice.app.companion import Companion, checked, emotion, numbers
from services.voice.app.config import PLACE_MARGIN, PLACE_THRESHOLD
from services.voice.app.dialog import VoiceDialog
from services.voice.app.main import create_app
from services.voice.app.resolver import PlaceResolver
from services.voice.app.trip import TripAnswers


class Knowledge:
    def search(self, text, k=4):
        from services.voice.app.knowledge import Hit, Passage
        if "coulé" in text.lower():
            return [Hit(Passage("categories.coule", ["c'est quoi le coulé"], "Le coulé, c'est l'option la moins chère."), 1.0)]
        return []


class WritingLLM:
    """LLM qui rédige une phrase imposée (pour vérifier ce que le compagnon accepte ou refuse)."""

    def __init__(self, text):
        self.text, self.calls = text, []

    def write(self, system, user, max_tokens=120, timeout_s=None):
        self.calls.append(user)
        return self.text

    def decide(self, *args, **kwargs):
        return None


def companion(reports=(), llm=None, compose=False, planner=None):
    resolver = PlaceResolver(FIXTURES / "gazetteer_test.json")
    planner = planner or Planner()
    live = FakeLive(reports=reports)
    trips = TripAnswers(resolver, planner, live.impact, live.reports)
    dialog = VoiceDialog(FakeNLU(), resolver, PLACE_THRESHOLD, PLACE_MARGIN, 0.5, planner, Knowledge(), trips, llm=None)
    return Companion(dialog, llm, compose=compose), planner, resolver


class CompagnonTest(unittest.TestCase):
    def test_trajet_empathie_sources_boutons_relances(self):
        c, planner, _ = companion()
        reply = c.chat("je suis fatigué, je vais au Plateau", position=POSITION)
        self.assertEqual(reply["kind"], "journeys")
        self.assertEqual(planner.calls[-1]["destination"]["name"], "Plateau")
        self.assertEqual(reply["companion"]["emotion"], "fatigue")
        self.assertIn(reply["safe_reply_text"], reply["reply_text"])  # les faits de SIRA, tels quels
        self.assertFalse(reply["reply_text"].startswith(reply["safe_reply_text"]))  # une phrase d'empathie d'abord
        self.assertIn("Aucun incident signalé vers Plateau", reply["reply_text"])
        self.assertEqual(reply["facts_sources"], ["Calcul SIRA-MORE", "Signalements des voyageurs"])
        self.assertEqual([a["id"] for a in reply["actions"]], ["voir_trajets"])
        self.assertIn("Et le moins cher ?", reply["suggestions"])
        self.assertEqual(reply["context"]["last_request"]["destination"]["name"], "Plateau")

    def test_suite_de_conversation_et_le_moins_cher(self):
        c, planner, _ = companion()
        first = c.chat("je vais au Plateau", position=POSITION)
        follow = c.chat("et le moins cher ?", history=[{"from": "me", "text": "je vais au Plateau"},
                                                      {"from": "sira", "text": first["reply_text"]}],
                        position=POSITION, context=first["context"])
        self.assertEqual(follow["kind"], "journeys")
        self.assertEqual((planner.calls[-1]["destination"]["name"], planner.calls[-1]["preference"]), ("Plateau", "cheap"))
        self.assertTrue(follow["safe_reply_text"].startswith("Le moins cher pour aller à Plateau"))
        self.assertNotIn("Et le moins cher ?", follow["suggestions"])

    def test_signalement_vers_la_destination(self):
        _, _, resolver = companion()
        plateau = resolver.resolve("Plateau")[0]
        c, _, _ = companion(reports=[{"title": "Accident", "status": "confirmed", "lat": plateau.lat, "lon": plateau.lon}])
        reply = c.chat("je vais au Plateau", position=POSITION)
        self.assertIn("accident signalé", reply["reply_text"])
        self.assertIn("Signalements des voyageurs", reply["facts_sources"])

    def test_question_de_la_faq_et_relances(self):
        c, _, _ = companion()
        reply = c.chat("le coulé là c'est quoi", position=POSITION)
        self.assertTrue(reply["reply_text"].startswith("Le coulé, c'est l'option la moins chère."))
        self.assertEqual(reply["facts_sources"], ["FAQ de SIRA"])
        self.assertTrue(reply["suggestions"])
        self.assertEqual(reply["actions"], [])
        self.assertTrue(reply["reply_text"].endswith("?"))  # une relance pour continuer la conversation

    def test_faq_jamais_un_bouton_signaler(self):
        # Vu le 2026-11-09 : « le coulé là c'est quoi » classé signalement à 0,36 → bouton « Signaler » à tort.
        from services.voice.tests.test_voice import FixedNLU
        c, _, _ = companion()
        c.dialog.nlu = FixedNLU("report_incident", 0.36)
        reply = c.chat("le coulé là c'est quoi", position=POSITION)
        self.assertEqual(reply["actions"], [])
        self.assertTrue(reply["reply_text"].endswith("?"))

    def test_emotion_qui_trouble_camembert_le_trajet_est_calcule(self):
        # Vu le 2026-11-09 : « j'ai peur de me perdre, je vais à Marcory » → le LLM demandait « Où es-tu ? ».
        from services.voice.tests.test_voice import FixedNLU
        c, planner, _ = companion()
        c.dialog.nlu = FixedNLU("out_of_scope", 0.4)
        real = FakeNLU()
        c.dialog.nlu.predict = lambda text: ("out_of_scope", 0.4, real.predict(text)[2])
        reply = c.chat("j'ai peur de me perdre, je vais au Plateau", position=POSITION)
        self.assertEqual(reply["kind"], "journeys")
        self.assertEqual(planner.calls[-1]["destination"]["name"], "Plateau")
        # LLM trop lent : la règle disait « je n'ai pas bien compris » ; le trajet est calculé quand même.
        c, planner, _ = companion()
        c.dialog.nlu = FixedNLU("navigate_to", 0.3)
        c.dialog.nlu.predict = lambda text: ("navigate_to", 0.3, real.predict(text)[2])
        reply = c.chat("j'ai peur de me perdre, je vais au Plateau", position=POSITION)
        self.assertEqual((reply["kind"], planner.calls[-1]["destination"]["name"]), ("journeys", "Plateau"))

    def test_bouchons_et_signalement_ne_deviennent_pas_un_trajet(self):
        from services.voice.tests.test_voice import EntityNLU
        c, planner, _ = companion()
        c.dialog.nlu = EntityNLU("traffic_status", [("PLACE", "Adjamé")])
        reply = c.chat("ça bouche à Adjamé ?", position=POSITION)
        self.assertNotEqual(reply["kind"], "journeys")
        self.assertEqual(planner.calls, [])

    def test_etapes_reellement_lancees(self):
        c, _, _ = companion()
        seen = []
        c.chat("je vais au Plateau", position=POSITION, on_step=seen.append)
        self.assertEqual(seen, ["comprendre", "trajets", "signalements"])

    def test_emotions(self):
        self.assertEqual(emotion("j'ai peur de rater mon bus"), "peur")
        self.assertEqual(emotion("je suis en retard pour mon entretien"), "retard")
        self.assertEqual(emotion("je vais au Plateau"), None)


class VraieFaqTest(unittest.TestCase):
    """Avec la vraie base de connaissances (knowledge/) : confidences et urgence."""

    def setUp(self):
        from services.voice.app import config
        from services.voice.app.knowledge import KnowledgeBase
        c, self.planner, _ = companion()
        c.dialog.knowledge = KnowledgeBase.load(config.KNOWLEDGE_DIR)
        self.c = c

    def test_urgence_avant_tout(self):
        reply = self.c.chat("il y a un accident grave au Plateau, quelqu'un est blessé", position=POSITION)
        self.assertIn("ambulance 185", reply["reply_text"])
        self.assertTrue(reply["reply_text"].startswith("Si quelqu'un est en danger"))
        self.assertIn("FAQ de SIRA", reply["facts_sources"])
        self.assertEqual([x["id"] for x in reply["actions"]], ["signaler"])  # après les secours, prévenir les autres
        self.assertFalse(reply["reply_text"].endswith("trajet ?"))  # pas de « Je peux t'aider pour un trajet ? »

    def test_confidence_sans_trajet(self):
        reply = self.c.chat("je suis perdu", position=POSITION)
        self.assertIn("je pars de ta position", reply["reply_text"])
        self.assertEqual(reply["reply_text"].count("pas grave"), 1)  # l'empathie n'est dite qu'une fois
        self.assertEqual(self.planner.calls, [])

    def test_fatigue_avec_destination_reste_un_trajet(self):
        reply = self.c.chat("je suis fatigué, je dois aller au Plateau", position=POSITION)
        self.assertEqual(reply["kind"], "journeys")


class VerificationTest(unittest.TestCase):
    FACTS = "[SIRA-MORE] Je te conseille pour aller à Plateau : le taxi. Environ 3900 francs, 44 minutes, sans marche."

    def test_chiffres(self):
        self.assertEqual(numbers("environ 3 900 francs, 44 minutes"), {"3900", "44"})
        self.assertIsNone(checked("D'après mes calculs, compte 3 900 francs et 44 minutes en taxi pour Plateau.", self.FACTS))
        self.assertIn("2500", checked("Un taxi partagé coûte 2500 francs.", self.FACTS))

    def test_noms_inventes(self):
        self.assertIn("uber", checked("Tu peux aussi prendre un Uber jusqu'au Plateau.", self.FACTS))
        self.assertIn("voyageurs", checked("D'après les voyageurs, le taxi met 44 minutes.", self.FACTS))

    def test_redaction_du_llm_refusee_puis_acceptee(self):
        bad = WritingLLM("Prends un taxi partagé via MyTaxi pour 2500 francs.")
        c, _, _ = companion(llm=bad, compose=True)
        reply = c.chat("je vais au Plateau", position=POSITION)
        self.assertFalse(reply["companion"]["composed"])
        self.assertIn(reply["safe_reply_text"], reply["reply_text"])
        good_text = "Je te conseille le gbaka pour aller à Plateau : 400 francs et 42 minutes. On y va ?"
        c, _, _ = companion(llm=WritingLLM(good_text), compose=True)
        reply = c.chat("je vais au Plateau", position=POSITION)
        self.assertTrue(reply["companion"]["composed"], reply["companion"])
        self.assertEqual(reply["reply_text"], good_text)


class ApiCompagnonTest(unittest.TestCase):
    def test_chat_et_chat_en_direct(self):
        with TestClient(create_app(nlu=FakeNLU(), planner=Planner(), live=FakeLive())) as client:
            body = {"text": "je vais au Plateau", "position": {"lat": POSITION["lat"], "lon": POSITION["lon"]},
                    "history": [], "speak": False}
            reply = client.post("/voice/chat", json=body).json()
            self.assertEqual((reply["kind"], reply["actions"][0]["id"]), ("journeys", "voir_trajets"))
            lines = [json.loads(line) for line in client.post("/voice/chat?stream=true", json=body).text.splitlines() if line]
            self.assertEqual([e["step"] for e in lines if e["type"] == "step"], ["comprendre", "trajets", "signalements"])
            self.assertEqual(lines[-1]["type"], "final")
            self.assertEqual(lines[-1]["payload"]["kind"], "journeys")
            self.assertEqual(client.post("/voice/hear", files={"audio": ("v.webm", b"", "audio/webm")}).status_code, 400)


if __name__ == "__main__":
    unittest.main()
