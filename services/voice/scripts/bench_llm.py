"""Banc d'essai des LLM locaux pour le rôle de chef d'orchestre de SIRA (docs/plan-ia-locale.md).

Chaque modèle reçoit les mêmes questions et doit choisir le bon OUTIL avec les bons paramètres ; il ne doit
jamais donner lui-même un prix, une durée ou une heure (les chiffres viennent des outils de SIRA).

Questions :
- T01 à T40 : les 40 phrases de test réelles (services/voice/outils/phrases_test_voix.csv), avec le lieu attendu ;
- P01 à P06 : questions écrites pour ce banc (Mes lieux, hors sujet, piège sur un prix).

Mesures par modèle : temps de réponse (moyenne, P90), bon outil, bon lieu, chiffres inventés, réponses illisibles.
Le modèle tourne dans llama-server (llama.cpp), lancé et arrêté par ce script, sur le port 8300.

Usage, depuis la racine du projet :
  services/voice/.venv/Scripts/python services/voice/scripts/bench_llm.py [--models a.gguf b.gguf] [--threads 4]
Rapport : services/voice/benchmarks/<date>_llm/ (rapport.md + resultats.csv).
"""
from __future__ import annotations

import argparse
import csv
import json
import platform
import re
import statistics
import subprocess
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
LLM_DIR = ROOT / "services" / "models" / "llm"
SERVER = LLM_DIR / "llama.cpp" / ("llama-server.exe" if platform.system() == "Windows" else "llama-server")
PORT = 8300
DEFAULT_MODELS = ["Qwen3.5-4B-Q4_K_M.gguf", "Ministral-3-3B-Instruct-2512-Q4_K_M.gguf", "Qwen3.5-2B-Q4_K_M.gguf"]

SAVED_PLACES = [("Maison", "Riviéra Palmeraie"), ("Travail", "Orange Digital Center"), ("Chez Tantie", "Niangon sud")]

SYSTEM = f"""Tu es SIRA, l'assistant de mobilité d'Abidjan (gbaka, wôrô-wôrô, bus SOTRA, bateau-bus, taxi).
Tu tutoies le voyageur. Réponds en français, en une ou deux phrases courtes.
Règle absolue : tu ne donnes JAMAIS toi-même un prix, une durée, une heure ou un numéro de ligne. Ces chiffres
viennent uniquement des outils. Dès qu'une demande concerne un trajet, un prix, une durée, un arrêt, le trafic ou
une information sur SIRA, appelle l'outil adapté au lieu de répondre.
Le voyageur peut être en train de suivre un trajet : pour « je descends où », « ça fait combien », « j'arrive
quand », utilise trajet_en_cours.
Lieux enregistrés par le voyageur : {"; ".join(f"{label} = {address}" for label, address in SAVED_PLACES)}.
Hors du transport à Abidjan, réponds poliment que tu ne t'occupes que des trajets, sans appeler d'outil."""

TOOLS = [
    {"type": "function", "function": {
        "name": "calculer_trajet",
        "description": "Calcule les trajets avec le moteur SIRA-MORE (prix, durées, lignes, marche).",
        "parameters": {"type": "object", "properties": {
            "destination": {"type": "string", "description": "Lieu d'arrivée tel que dit (quartier, gare, lieu enregistré)"},
            "depart": {"type": "string", "description": "Lieu de départ s'il est dit, sinon absent (position du voyageur)"},
            "preference": {"type": "string", "enum": ["rapide", "moins_cher", "equilibre", "peu_de_marche"]},
            "budget_fcfa": {"type": "integer"},
            "modes_preferes": {"type": "array", "items": {"type": "string", "enum": ["gbaka", "woro", "sotra", "bateau", "taxi"]}},
            "modes_exclus": {"type": "array", "items": {"type": "string", "enum": ["gbaka", "woro", "sotra", "bateau", "taxi"]}},
            "heure": {"type": "string", "description": "Heure de départ ou d'arrivée dite, ex. « avant 8 h »"},
        }, "required": ["destination"]}}},
    {"type": "function", "function": {
        "name": "trajet_en_cours",
        "description": "Répond sur le trajet que le voyageur suit (arrêt de descente, prix, heure d'arrivée, incidents).",
        "parameters": {"type": "object", "properties": {
            "sujet": {"type": "string", "enum": ["arret", "prix", "arrivee", "incidents"]}}, "required": ["sujet"]}}},
    {"type": "function", "function": {
        "name": "signaler_incident",
        "description": "Enregistre un signalement du voyageur (accident, bouchon, inondation, route barrée).",
        "parameters": {"type": "object", "properties": {
            "type": {"type": "string", "enum": ["accident", "bouchon", "inondation", "route_barree", "autre"]},
            "lieu": {"type": "string"}}, "required": ["type"]}}},
    {"type": "function", "function": {
        "name": "chercher_info",
        "description": "Cherche dans la base de connaissances de SIRA (modes de transport, horaires généraux, appli).",
        "parameters": {"type": "object", "properties": {"question": {"type": "string"}}, "required": ["question"]}}},
]

# Outil attendu pour les phrases T31 à T40 (sans lieu attendu, sauf T36 et T40 qui en ont un).
EXPECTED_TOOL = {"T31": "trajet_en_cours", "T32": "trajet_en_cours", "T33": "trajet_en_cours", "T34": "trajet_en_cours",
                 "T35": None, "T37": "signaler_incident", "T38": "chercher_info", "T39": "chercher_info"}
EXTRA = [  # (id, texte, outil attendu, lieux acceptés)
    ("P01", "Je rentre à la maison.", "calculer_trajet", ["Maison", "Riviéra Palmeraie"]),
    ("P02", "Emmène-moi au boulot.", "calculer_trajet", ["Travail", "Orange Digital Center"]),
    ("P03", "Je vais chez Tantie.", "calculer_trajet", ["Chez Tantie", "Niangon sud", "Niangon"]),
    ("P04", "Le wôrô-wôrô de Cocody à Adjamé coûte combien ?", "calculer_trajet", ["Adjamé"]),
    ("P05", "Il va pleuvoir demain à Paris ?", None, []),
    ("P06", "Raconte-moi une blague.", None, []),
]


def fold(text: str) -> str:
    text = unicodedata.normalize("NFD", text or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9 ]+", " ", text).strip()


def questions() -> list[dict]:
    rows = []
    with open(ROOT / "services" / "voice" / "outils" / "phrases_test_voix.csv", encoding="utf-8") as file:
        for row in csv.DictReader(file, delimiter=";"):
            qid, place = row["fichier"], row["lieu"].strip()
            tool = EXPECTED_TOOL.get(qid, "calculer_trajet")  # toutes les phrases avec un lieu : un trajet
            rows.append({"id": qid, "texte": row["texte"], "outil": tool, "lieux": [place] if place else [], "source": "réelle"})
    rows += [{"id": i, "texte": t, "outil": o, "lieux": lieux, "source": "écrite pour le banc"} for i, t, o, lieux in EXTRA]
    return rows


def post(path: str, payload: dict, timeout: float) -> dict:
    request = urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", data=json.dumps(payload).encode(),
                                     headers={"content-type": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read())


def wait_ready(process: subprocess.Popen, seconds: float = 300) -> None:
    end = time.time() + seconds
    while time.time() < end:
        if process.poll() is not None:
            raise RuntimeError("llama-server s'est arrêté au démarrage")
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=3) as response:
                if json.loads(response.read()).get("status") == "ok":
                    return
        except (urllib.error.URLError, ConnectionError, json.JSONDecodeError):
            pass
        time.sleep(2)
    raise TimeoutError("llama-server n'est pas prêt")


def ask(text: str) -> tuple[float, dict]:
    payload = {"messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": text}],
               "tools": TOOLS, "temperature": 0, "max_tokens": 256,
               # Qwen3.5 : réponse directe, sans phase de réflexion (le temps compte sur un processeur).
               "chat_template_kwargs": {"enable_thinking": False}}
    start = time.perf_counter()
    reply = post("/v1/chat/completions", payload, timeout=180)
    return time.perf_counter() - start, reply["choices"][0]["message"]


def judge(q: dict, message: dict) -> dict:
    calls = message.get("tool_calls") or []
    tool = calls[0]["function"]["name"] if calls else None
    try:
        args = json.loads(calls[0]["function"]["arguments"]) if calls else {}
        readable = True
    except (json.JSONDecodeError, KeyError, TypeError):
        args, readable = {}, False
    text = message.get("content") or ""
    said_place = " ".join(str(args.get(key, "")) for key in ("destination",))
    place_ok = None
    if q["lieux"] and tool == "calculer_trajet":
        place_ok = any(fold(expected) in fold(said_place) or (fold(said_place) and fold(said_place) in fold(expected))
                       for expected in q["lieux"])
    # Un chiffre dans la réponse écrite sans outil = chiffre inventé (prix, durée, heure, ligne).
    invented = not calls and bool(re.search(r"\d", text))
    return {"outil_obtenu": tool or "", "outil_ok": tool == q["outil"], "lieu_dit": said_place, "lieu_ok": place_ok,
            "chiffre_invente": invented, "lisible": readable, "reponse": text.strip()[:160],
            "arguments": json.dumps(args, ensure_ascii=False)}


def run_model(model: Path, threads: int | None, rows: list[dict]) -> list[dict]:
    command = [str(SERVER), "-m", str(model), "--port", str(PORT), "--ctx-size", "4096", "--jinja"]
    if threads:
        command += ["--threads", str(threads)]
    process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    results = []
    try:
        loaded = time.perf_counter()
        wait_ready(process)
        load_s = time.perf_counter() - loaded
        ask("Bonjour")  # première réponse toujours plus lente : non comptée
        for q in rows:
            try:
                seconds, message = ask(q["texte"])
                result = judge(q, message)
            except Exception as error:  # réponse illisible ou délai dépassé
                seconds, result = float("nan"), {"outil_obtenu": "", "outil_ok": False, "lieu_dit": "", "lieu_ok": False,
                                                 "chiffre_invente": False, "lisible": False, "reponse": f"ERREUR {error}",
                                                 "arguments": ""}
            results.append({"modele": model.name, "chargement_s": round(load_s, 1), "id": q["id"], "source": q["source"],
                            "texte": q["texte"], "outil_attendu": q["outil"] or "", "secondes": round(seconds, 2), **result})
            print(f"  {q['id']} {seconds:5.1f}s {'ok ' if result['outil_ok'] else 'NON'} {result['outil_obtenu'] or '-':18} {result['lieu_dit'][:30]}")
    finally:
        process.terminate()
        process.wait(timeout=30)
    return results


def summary(results: list[dict]) -> list[str]:
    lines = ["| Modèle | Chargement | Réponse moy. | P90 | Bon outil | Bon lieu | Chiffres inventés | Illisibles |",
             "|---|---|---|---|---|---|---|---|"]
    for model in dict.fromkeys(r["modele"] for r in results):
        rows = [r for r in results if r["modele"] == model]
        times = sorted(r["secondes"] for r in rows if r["secondes"] == r["secondes"])
        places = [r for r in rows if r["lieu_ok"] is not None]
        p90 = times[int(0.9 * (len(times) - 1))] if times else float("nan")
        lines.append(f"| {model} | {rows[0]['chargement_s']} s | {statistics.mean(times):.1f} s | {p90:.1f} s "
                     f"| {sum(r['outil_ok'] for r in rows)}/{len(rows)} | {sum(r['lieu_ok'] for r in places)}/{len(places)} "
                     f"| {sum(r['chiffre_invente'] for r in rows)} | {sum(not r['lisible'] for r in rows)} |")
    return lines


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", nargs="*", default=DEFAULT_MODELS)
    parser.add_argument("--threads", type=int, default=None)
    args = parser.parse_args()
    if not SERVER.exists():
        sys.exit(f"llama-server introuvable : {SERVER}")
    rows = questions()
    results = []
    for name in args.models:
        model = LLM_DIR / name
        if not model.exists():
            print(f"[llm] absent, ignoré : {model}")
            continue
        print(f"[llm] {name}")
        results += run_model(model, args.threads, rows)
    out = ROOT / "services" / "voice" / "benchmarks" / f"{datetime.now():%Y-%m-%d_%H%M}_llm"
    out.mkdir(parents=True, exist_ok=True)
    with open(out / "resultats.csv", "w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(results[0]), delimiter=";")
        writer.writeheader()
        writer.writerows(results)
    report = ["# Banc d'essai des LLM locaux (chef d'orchestre)", "",
              f"- **Machine :** {platform.node()} · {platform.processor()} · {datetime.now():%Y-%m-%d %H:%M}",
              f"- **Moteur :** llama.cpp ({(LLM_DIR / 'llama.cpp' / 'VERSION').read_text().strip() if (LLM_DIR / 'llama.cpp' / 'VERSION').exists() else '?'}), température 0, sans réflexion",
              f"- **Questions :** {len(rows)} (40 phrases de test réelles + {len(EXTRA)} écrites pour le banc)", "",
              *summary(results), "",
              "Bon outil : l'outil attendu est appelé (ou aucun pour les questions hors sujet). Bon lieu : la destination",
              "donnée à calculer_trajet contient le lieu attendu. Chiffre inventé : un chiffre écrit sans appel d'outil."]
    (out / "rapport.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print("\n".join(report))
    print(f"\n[llm] Rapport : {out}")


if __name__ == "__main__":
    main()
