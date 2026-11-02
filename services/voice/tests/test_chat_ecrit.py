"""« Discuter avec SIRA » : ce qu'un échange réel du 2026-11-02 a montré de travers, et qui ne doit pas revenir.

- question écrite : SIRA ne dit plus « répète plus fort » ;
- « j'ai besoin d'aide » : SIRA dit ce qu'il sait faire, sans attendre le LLM ;
- réponses du LLM sans émoji ni astérisques ; LLM « réchauffé » au démarrage ;
- budget trop petit (« Koumassi, j'ai 100 francs ») : le prix du moins cher, calculé par SIRA-MORE.
Lancer : npm run test:voice
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_voice import FAKE_RESULT, FIXTURES, POSITION, FakeNLU, Planner  # noqa: E402  (aides, pas de tests)

from fastapi.testclient import TestClient  # noqa: E402
from services.voice.app.config import PLACE_MARGIN, PLACE_THRESHOLD  # noqa: E402
from services.voice.app.dialog import OTHER_REPLIES, QUESTIONS, TYPED_AGAIN, VoiceDialog  # noqa: E402
from services.voice.app.llm import LocalLLM, clean_reply  # noqa: E402
from services.voice.app.main import create_app  # noqa: E402
from services.voice.app.resolver import PlaceResolver  # noqa: E402


class UnsureNLU:
    """CamemBERT qui ne sait pas (« euh », phrase floue) : intention trop peu sûre."""

    def predict(self, text):
        return "navigate_to", 0.2, []


class RecordingLLM:
    def __init__(self):
        self.calls = []

    def decide(self, text, saved_places=None, in_trip=False):
        self.calls.append(text)
        return None


def dialog(nlu, planner=None, llm=None):
    return VoiceDialog(nlu, PlaceResolver(FIXTURES / "gazetteer_test.json"), PLACE_THRESHOLD, PLACE_MARGIN, 0.5,
                       planner or Planner(), llm=llm)


class QuestionEcriteTest(unittest.TestCase):
    def test_ecrit_on_demande_de_reformuler(self):
        self.assertEqual(dialog(UnsureNLU()).ask("explique moi mieux ce contexte", POSITION, typed=True)["reply_text"], TYPED_AGAIN)

    def test_dit_on_demande_toujours_de_repeter(self):
        self.assertEqual(dialog(UnsureNLU()).ask("euh", POSITION)["reply_text"], QUESTIONS["low_intent_confidence"])

    def test_route_texte_de_l_app(self):
        with TestClient(create_app(nlu=UnsureNLU(), planner=Planner())) as client:
            reply = client.post("/voice/ask", json={"text": "explique moi mieux", "speak": False}).json()
        self.assertEqual(reply["reply_text"], TYPED_AGAIN)
        self.assertNotIn("plus fort", reply["reply_text"])


class DemandeAideTest(unittest.TestCase):
    def test_besoin_d_aide_sans_attendre_le_llm(self):
        llm = RecordingLLM()
        reply = dialog(UnsureNLU(), llm=llm).ask("J'ai besoin d'aide.", POSITION)
        self.assertEqual(reply["reply_text"], OTHER_REPLIES["voice_help"])
        self.assertEqual(llm.calls, [])  # réponse immédiate : pas 20 s d'attente pour rien

    def test_aide_moi_a_aller_reste_un_trajet(self):
        reply = dialog(FakeNLU()).ask("Aide-moi, je vais au Plateau", POSITION)
        self.assertEqual(reply["kind"], "journeys")


class ReponseDuLLMTest(unittest.TestCase):
    def test_sans_emoji_ni_mise_en_forme(self):
        raw = "Bien sûr ! Je t'aide avec les **gbaka** et les `wôrô-wôrô`. 😊\n- Dis-moi où tu vas ! 🚌"
        self.assertEqual(clean_reply(raw), "Bien sûr ! Je t'aide avec les gbaka et les wôrô-wôrô. Dis-moi où tu vas !")

    def test_rechauffe_au_demarrage_meme_si_le_modele_charge_encore(self):
        sent = []

        def post(url, payload, timeout):
            sent.append(payload)
            if len(sent) < 3:
                raise OSError("llama-server charge encore le modèle")
            return {"choices": [{"message": {"content": ""}}]}

        self.assertTrue(LocalLLM("http://x", post=post).warm(wait_s=0))
        self.assertEqual(len(sent), 3)
        self.assertEqual(sent[-1]["max_tokens"], 1)  # on ne veut que la mise en cache des consignes
        self.assertFalse(LocalLLM("http://x", post=lambda *a: (_ for _ in ()).throw(OSError("arrêté"))).warm(attempts=2, wait_s=0))


class BudgetTropPetitTest(unittest.TestCase):
    class BudgetPlanner(Planner):
        """Comme SIRA-MORE : rien sous 400 francs."""

        def __call__(self, request):
            self.calls.append(request)
            return {"journeys": []} if request.get("budget", 10_000) < 400 else FAKE_RESULT

    def test_on_donne_le_moins_cher_au_lieu_de_rien(self):
        planner = self.BudgetPlanner()
        reply = dialog(FakeNLU(), planner).ask("Je vais au Plateau, j'ai 100 francs", POSITION)
        self.assertEqual(planner.calls[0]["budget"], 100)
        self.assertNotIn("budget", planner.calls[1])
        self.assertIn("Avec 100 francs", reply["reply_text"])
        self.assertIn("environ 400 francs", reply["reply_text"])  # prix de SIRA-MORE, pas deviné
        self.assertEqual((reply["kind"], reply["chosen_id"]), ("journeys", "j1"))

    def test_rien_du_tout_on_le_dit(self):
        reply = dialog(FakeNLU(), Planner(result={"journeys": []})).ask("Je vais au Plateau, j'ai 100 francs", POSITION)
        self.assertIn("Je n'ai pas trouvé de trajet", reply["reply_text"])


if __name__ == "__main__":
    unittest.main()
