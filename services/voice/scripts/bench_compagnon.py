"""Banc d'essai du compagnon « Discuter avec SIRA » (docs/assistant-compagnon.md, étape 3).

Rejoue une quarantaine de conversations contre un service qui tourne (par l'API, comme l'application) et note chaque
réponse : aucun chiffre inventé, sources citées, bon bouton, bon type de réponse, temps. Rapport Markdown + JSON dans
services/voice/benchmarks/<date>_compagnon/.

    python services/voice/scripts/bench_compagnon.py [--api http://localhost:4000/api/v1] [--position 5.441,-4.009]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parents[1]))
from services.voice.app.companion import numbers  # noqa: E402

# Chaque conversation : une suite de messages ; chaque message : ce qu'on attend.
#   kind     : type de réponse attendu (journeys, info, question, retry), ou une liste de types permis
#   action   : bouton attendu (voir_trajets, signaler) ; "aucun" = pas de bouton
#   contient : mots attendus dans la réponse ; jamais : mots interdits
#   sources  : la réponse doit citer au moins une source
CONVERSATIONS: list[tuple[str, str, list[dict]]] = [
    # --- trajets
    ("trajet", "Plateau", [{"text": "je vais au Plateau", "kind": "journeys", "action": "voir_trajets", "sources": True}]),
    ("trajet", "Cocody", [{"text": "je veux aller à Cocody", "kind": "journeys", "action": "voir_trajets", "sources": True}]),
    ("trajet", "Abobo → Treichville", [{"text": "je quitte Abobo, je vais à Treichville", "kind": "journeys", "sources": True}]),
    ("trajet", "Prix Yopougon", [{"text": "c'est combien pour aller à Yopougon ?", "kind": "journeys", "sources": True}]),
    ("trajet", "Rapide Marcory", [{"text": "le plus rapide pour aller à Marcory", "kind": "journeys", "contient": ["rapide"], "sources": True}]),
    ("jour", "Adjamé demain 8 h", [{"text": "je veux aller à Adjamé demain à 8 h", "kind": "journeys", "sources": True}]),
    ("jour", "Plateau demain 7 h 30 le moins cher", [{"text": "le moins cher pour aller au Plateau demain à 7 h 30", "kind": "journeys", "sources": True}]),
    ("jour", "Yopougon demain 10 h", [{"text": "je vais à Yopougon demain à 10 h", "kind": "journeys", "sources": True}]),
    # --- suites de conversation
    ("suite", "Plateau puis le moins cher", [
        {"text": "je vais au Plateau", "kind": "journeys"},
        {"text": "et le moins cher ?", "kind": "journeys", "contient": ["moins cher", "Plateau"], "sources": True}]),
    ("suite", "Cocody puis le plus rapide", [
        {"text": "je veux aller à Cocody", "kind": "journeys"},
        {"text": "et le plus rapide ?", "kind": "journeys", "contient": ["rapide", "Cocody"]}]),
    ("suite", "Yopougon puis bouchons", [
        {"text": "je vais à Yopougon", "kind": "journeys"},
        {"text": "ça bouche vers Yopougon ?", "kind": "info", "contient": ["Yopougon"], "sources": True}]),
    # --- émotion + trajet
    ("emotion", "Fatigué → Cocody", [{"text": "je suis fatigué, je vais à Cocody", "kind": "journeys", "action": "voir_trajets", "sources": True}]),
    ("emotion", "Retard entretien Plateau", [{"text": "je suis en retard pour mon entretien au Plateau", "kind": "journeys", "sources": True}]),
    ("emotion", "Peur de se perdre → Marcory", [{"text": "j'ai peur de me perdre, je vais à Marcory", "kind": "journeys", "sources": True}]),
    # --- confidences
    ("confidence", "Perdu", [{"text": "je suis perdu", "kind": "info", "contient": ["position"], "action": "aucun"}]),
    ("confidence", "Stressé", [{"text": "je suis stressé", "kind": "info", "action": "aucun"}]),
    ("confidence", "En retard", [{"text": "je suis en retard", "kind": ["info", "question"], "action": "aucun"}]),
    ("confidence", "Tard ce soir", [{"text": "je rentre tard ce soir", "kind": ["info", "question"], "action": "aucun"}]),
    ("confidence", "Fatigué", [{"text": "je suis fatigué", "kind": "info", "action": "aucun"}]),
    # --- FAQ
    ("faq", "Coulé Debout Suspendu", [{"text": "c'est quoi Coulé, Debout, Suspendu ?", "kind": "info", "contient": ["Coulé"], "action": "aucun", "sources": True}]),
    ("faq", "Gbaka et wôrô", [{"text": "différence entre gbaka et wôrô ?", "kind": "info", "action": "aucun", "sources": True}]),
    ("faq", "Signaler un accident", [{"text": "comment signaler un accident ?", "kind": "info", "action": "aucun", "sources": True}]),
    ("faq", "Voix gardée", [{"text": "tu gardes ma voix ?", "kind": "info", "action": "aucun", "sources": True}]),
    ("faq", "Bateau-bus Treichville", [{"text": "le bateau-bus part d'où à Treichville ?", "kind": "info", "sources": True}]),
    ("faq", "Coulé en nouchi", [{"text": "le coulé là c'est quoi", "kind": "info", "action": "aucun", "sources": True}]),
    # --- urgence
    ("urgence", "Accident grave avec blessé", [{"text": "il y a un accident grave à Adjamé, quelqu'un est blessé", "contient": ["185", "180"], "action": "signaler", "sources": True}]),
    ("urgence", "Agression", [{"text": "au secours on m'a agressé", "contient": ["110"], "sources": True}]),
    ("urgence", "Numéro des pompiers", [{"text": "quel est le numéro des pompiers ?", "contient": ["180"], "sources": True}]),
    # --- signalements
    ("signalement", "Accident à Adjamé", [{"text": "il y a un accident à Adjamé", "kind": ["info", "question"], "jamais": ["Voir les trajets"]}]),
    ("signalement", "Ça bouche à Adjamé ?", [{"text": "ça bouche à Adjamé ?", "kind": "info", "contient": ["Adjamé"], "sources": True}]),
    # --- hors sujet (jamais un trajet)
    ("hors-sujet", "CAN", [{"text": "qui va gagner la CAN cette année ?", "kind": ["info", "question", "retry"], "action": "aucun"}]),
    ("hors-sujet", "Recette attiéké", [{"text": "donne-moi la recette de l'attiéké", "kind": ["info", "question", "retry"], "action": "aucun"}]),
    ("hors-sujet", "Blague", [{"text": "raconte-moi une blague", "kind": ["info", "question", "retry"], "action": "aucun"}]),
    ("hors-sujet", "Météo", [{"text": "quel temps il fait demain ?", "kind": ["info", "question", "retry"], "action": "aucun"}]),
    # --- échanges
    ("echange", "Bonjour", [{"text": "bonjour", "kind": "info", "action": "aucun"}]),
    ("echange", "Merci", [{"text": "merci", "kind": "info", "action": "aucun"}]),
    ("echange", "Ça va", [{"text": "ça va ?", "kind": "info", "action": "aucun"}]),
    # --- ambigu
    ("ambigu", "C'est où ? Koumassi", [{"text": "C'est où ? C'est à Koumassi.", "kind": ["journeys", "info", "question"]}]),
    ("ambigu", "Juste un quartier", [{"text": "Koumassi", "kind": ["journeys", "question"]}]),
]


def post(api: str, body: dict) -> dict:
    request = urllib.request.Request(f"{api}/voice/chat", data=json.dumps(body).encode("utf-8"),
                                     headers={"content-type": "application/json"})
    with urllib.request.urlopen(request, timeout=240) as response:
        return json.loads(response.read())


def grade(expect: dict, reply: dict, seconds: float) -> dict:
    problems = []
    kinds = expect.get("kind")
    if kinds and reply.get("kind") not in (kinds if isinstance(kinds, list) else [kinds]):
        problems.append(f"type {reply.get('kind')} au lieu de {kinds}")
    text = reply.get("reply_text") or ""
    for word in expect.get("contient", []):
        if word.lower() not in text.lower():
            problems.append(f"« {word} » absent")
    for word in expect.get("jamais", []):
        if word.lower() in text.lower() or word in [a["label"] for a in reply.get("actions") or []]:
            problems.append(f"« {word} » présent")
    actions = [a["id"] for a in reply.get("actions") or []]
    if expect.get("action") == "aucun" and actions:
        problems.append(f"bouton inattendu {actions}")
    elif expect.get("action") and expect["action"] != "aucun" and expect["action"] not in actions:
        problems.append(f"bouton {expect['action']} absent")
    if expect.get("sources") and not reply.get("facts_sources"):
        problems.append("aucune source citée")
    # Aucun chiffre inventé : chaque nombre vient de la réponse sûre de SIRA, des signalements ou du message.
    report_sentences = " ".join(s for s in re.split(r"(?<=[.!?])\s+", text) if "signal" in s.lower())
    allowed = numbers(reply.get("safe_reply_text") or "") | numbers(expect["text"]) | numbers(report_sentences)
    if "urgence.numeros" in (reply.get("sources") or []):
        allowed |= {"110", "111", "170", "180", "185"}  # fiche sourcée (knowledge/compagnon.md)
    invented = numbers(text) - allowed
    if invented:
        problems.append(f"chiffre(s) sans source : {sorted(invented)}")
    return {"ok": not problems, "problems": problems, "invented": sorted(invented), "seconds": round(seconds, 1)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:4000/api/v1")
    parser.add_argument("--position", default="5.441,-4.009", help="lat,lon du voyageur (défaut : Abobo, position de démo)")
    args = parser.parse_args()
    lat, lon = (float(v) for v in args.position.split(","))
    results = []
    for family, name, turns in CONVERSATIONS:
        history, context = [], None
        for index, expect in enumerate(turns):
            start = time.perf_counter()
            try:
                reply = post(args.api, {"text": expect["text"], "history": history, "position": {"lat": lat, "lon": lon},
                                        "context": context, "speak": False})
            except Exception as error:  # service arrêté, délai dépassé : noté, le banc continue
                results.append({"famille": family, "conversation": name, "tour": index + 1, "message": expect["text"],
                                "ok": False, "problems": [f"erreur : {error}"], "invented": [], "seconds": None, "reponse": None})
                print(f"ERREUR  {name} : {error}")
                break
            seconds = time.perf_counter() - start
            note = grade(expect, reply, seconds)
            results.append({"famille": family, "conversation": name, "tour": index + 1, "message": expect["text"], **note,
                            "reponse": reply.get("reply_text"), "type": reply.get("kind"), "sources": reply.get("facts_sources"),
                            "boutons": [a["label"] for a in reply.get("actions") or []], "relances": reply.get("suggestions"),
                            "compagnon": reply.get("companion")})
            print(f"{'OK    ' if note['ok'] else 'ÉCHEC '} {note['seconds']:5.1f} s  {name} ({index + 1}) {'; '.join(note['problems'])}")
            history = [*history, {"from": "me", "text": expect["text"]}, {"from": "sira", "text": reply.get("reply_text", "")}][-12:]
            context = reply.get("context")
    write_report(results, args)


def write_report(results: list[dict], args) -> None:
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    out = ROOT / "benchmarks" / f"{stamp}_compagnon"
    out.mkdir(parents=True, exist_ok=True)
    (out / "resultats.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    ok = sum(r["ok"] for r in results)
    times = sorted(r["seconds"] for r in results if r["seconds"] is not None)
    median = times[len(times) // 2] if times else None
    invented = sum(bool(r["invented"]) for r in results)
    lines = [f"# Banc d'essai du compagnon — {stamp}", "",
             f"API : `{args.api}` · position : {args.position} · {len(results)} réponses notées.", "",
             "| Mesure | Résultat |", "|---|---|",
             f"| Réponses conformes | {ok}/{len(results)} |",
             f"| Réponses avec un chiffre sans source | {invented} |",
             f"| Temps médian | {median} s |" if median is not None else "| Temps médian | — |",
             f"| Temps le plus long | {times[-1]} s |" if times else "| Temps le plus long | — |", "",
             "| Famille | Conversation | Tour | Résultat | Temps | Message | Réponse de SIRA |", "|---|---|---|---|---|---|---|"]
    for r in results:
        verdict = "OK" if r["ok"] else "ÉCHEC : " + "; ".join(r["problems"])
        reply = (r.get("reponse") or "").replace("|", "/")
        lines.append(f"| {r['famille']} | {r['conversation']} | {r['tour']} | {verdict} | {r['seconds']} s | {r['message']} | {reply} |")
    (out / "rapport.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\n{ok}/{len(results)} conformes · chiffres sans source : {invented} · médiane {median} s · rapport : {out / 'rapport.md'}")


if __name__ == "__main__":
    main()
