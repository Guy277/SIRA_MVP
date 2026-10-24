"""Phrases à enregistrer pour entraîner la voix (Whisper, puis CamemBERT) : services/voice/outils/phrases_entrainement_voix.csv.

Chaque mot important revient au moins 3 fois, dans des phrases différentes. Rien d'inventé :
- lieux : répertoire de la voix (gazetteer + knowledge/lieux_complements.json), chacun vérifié par le correcteur ;
- mots du transport et parler d'Abidjan : lexique SIRA fr-CI (docs/voix, onglet 05_Lexique_RAG) et réseau ;
- les 40 phrases d'examen (phrases_test_voix.csv) sont exclues : elles servent à mesurer, jamais à entraîner.

Priorités (analyse du 2026-10-20) : 1) mots ratés par Whisper sur la voix d'Achille (Angré, CHU, Zone 4, aéroport,
gbaka, coulé, SIRA) et grands lieux ; 2) quartiers aux noms non français ; 3) vocabulaire du trajet, argent, parler
d'Abidjan, réponses courtes.

Lancement depuis la racine du projet :
  services/voice/.venv/Scripts/python services/voice/outils/generer_phrases_entrainement.py
"""
from __future__ import annotations

import csv
import random
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from services.voice.app import config  # noqa: E402
from services.voice.app.resolver import PlaceResolver, norm  # noqa: E402

OUT = Path(__file__).with_name("phrases_entrainement_voix.csv")
TEST = Path(__file__).with_name("phrases_test_voix.csv")

# Priorité 1 : ratés de Whisper et grands lieux ; priorité 2 : quartiers aux noms non français.
PRIORITE_1 = ["Angré", "CHU de Cocody", "Zone 4", "Aéroport", "Gare Nord", "Gare Sud", "Adjamé Liberté",
              "Adjamé 220 Logements", "Cité Administrative", "Gare de Bassam", "Abobo Gare", "Grand-Bassam",
              "Abobo", "Adjamé", "Anyama", "Attécoubé", "Bingerville", "Cocody", "Koumassi", "Marcory", "Plateau",
              "Port-Bouët", "Songon", "Treichville", "Yopougon"]
PRIORITE_2 = ["Akouédo", "Anoumabo", "Andokoi", "Wassakara", "Koweït", "N'dotré", "Samaké", "Agban", "Gesco",
              "Micao", "Selmer", "Biétry", "Abatta", "Niangon", "Siporex", "Yopougon Kouté", "Gonzagueville",
              "Williamsville", "Vridi", "Faya", "Blockhaus", "Remblais", "Toit Rouge", "PK 18", "Abobo Doumé",
              "Abobo Baoulé", "Riviera Palmeraie", "Deux-Plateaux", "Saint Jean", "Mermoz", "Vieux Cocody",
              "M'Badon", "Bonoumin", "Adiopodoumé", "Avocatier", "Danga", "Indénié", "Marcory Résidentiel",
              "Treichville Arras", "Riviera 2", "Riviera 3", "Kennedy", "Locodjro", "Biafra"]

# Article avec lequel on dit le lieu (comme dans les phrases d'examen : « au Plateau », « à la Zone 4 »,
# « à l'aéroport ») ; sans entrée, pas d'article (« à Yopougon », « à Riviera Palmeraie »).
ARTICLE = {"Plateau": "le", "CHU de Cocody": "le", "Zone 4": "la", "Gare de Bassam": "la", "Aéroport": "l'",
           "Gare Nord": "la", "Gare Sud": "la", "Cité Administrative": "la", "Deux-Plateaux": "les", "PK 18": "le",
           "Vieux Cocody": "le"}
SPOKEN = {"Aéroport": "aéroport"}  # « l'aéroport » : nom commun, sans majuscule


def forms(name: str) -> dict:
    """« à », « pour » et la forme seule d'un lieu, avec son article : au Plateau, pour le Plateau, le Plateau."""
    article, spoken = ARTICLE.get(name), SPOKEN.get(name, name)
    if article == "le":
        return {"a": f"au {spoken}", "pour": f"pour le {spoken}", "seul": f"le {spoken}"}
    if article == "les":
        return {"a": f"aux {spoken}", "pour": f"pour les {spoken}", "seul": f"les {spoken}"}
    if article == "l'":
        return {"a": f"à l'{spoken}", "pour": f"pour l'{spoken}", "seul": f"l'{spoken}"}
    if article == "la":
        return {"a": f"à la {spoken}", "pour": f"pour la {spoken}", "seul": f"la {spoken}"}
    return {"a": f"à {spoken}", "pour": f"pour {spoken}", "seul": spoken}


# Façons de demander un trajet (registre du lexique : « je quitte », « je prends quoi », « c'est combien »…).
DESTINATION = [
    "Je vais {a}.", "Comment je fais pour aller {a} ?", "Je quitte {o_seul}, je vais {a}.",
    "Le gbaka {pour}, c'est combien ?", "Je veux descendre {a}.", "Montre-moi le chemin {pour}.",
    "Je pars {a}, je prends quoi ?", "Pardon, pour aller {a} je fais comment ?", "Je suis {o_a}, je veux aller {a}.",
    "Il y a un wôrô-wôrô {pour} ?", "C'est quel bus {pour} ?", "Je veux aller {a} sans trop marcher.",
    "{Pour}, on passe par où ?", "Je veux béou {a}.", "Emmène-moi {a}.", "Je cherche un transport {pour}.",
]
# Vocabulaire du trajet, argent, parler d'Abidjan, réponses courtes (chaque phrase porte au moins un mot clé).
VOCABULAIRE = [
    ("gbaka", ["Le gbaka passe où ?", "Je préfère le gbaka.", "Pas de gbaka, je veux le bus.", "Le gbaka est plein."]),
    ("wôrô-wôrô", ["Le wôrô-wôrô coûte combien ?", "Je prends le wôrô-wôrô.", "Il y a un wôrô-wôrô ici ?"]),
    ("SOTRA", ["Le bus SOTRA passe à quelle heure ?", "Je veux le bus SOTRA.", "La SOTRA va jusqu'où ?"]),
    ("Monbus / Wibus / Express", ["Le Monbus s'arrête où ?", "Le Wibus passe par ici ?", "Je prends l'Express.", "La navette part d'où ?"]),
    ("bateau-bus", ["Le bateau-bus part à quelle heure ?", "Je veux prendre le bateau-bus.", "Le bateau-bus coûte combien ?"]),
    ("taxi communal", ["Je prends un taxi communal.", "Le taxi communal, c'est combien ?", "Pas de taxi, c'est trop cher."]),
    ("coulé / debout / suspendu", ["Montre-moi le trajet coulé.", "Je veux l'option debout.", "Le trajet suspendu, c'est quoi ?",
                                   "Le coulé, ça fait combien ?", "Donne-moi le debout."]),
    ("SIRA", ["SIRA, aide-moi.", "SIRA, je vais où ?", "Merci SIRA.", "SIRA, répète s'il te plaît."]),
    ("correspondance / terminus", ["Je change où ?", "La correspondance est où ?", "Je descends au terminus ?", "C'est le terminus ?"]),
    ("repères", ["Je suis au carrefour, après la pharmacie.", "Je suis au feu, devant la SGBCI.", "Je suis en bas du pont.",
                 "Je descends après le pont.", "C'est au rond-point de la SODECI.", "Je suis devant la CIE.",
                 "Arrête-moi niveau carrefour.", "Je suis à côté du marché, en face de la mosquée."]),
    ("argent", ["J'ai deux cents francs.", "J'ai cinq cents francs seulement.", "J'ai une barre.", "J'ai deux barres.",
                "Mon djê ne suffit pas.", "Ça fait trois cents francs ?", "Je veux payer moins de mille francs."]),
    ("parler d'Abidjan", ["Ya foye.", "Y'a drap sur la route.", "Ça bouche à Adjamé.", "Ça roule bien ce matin.",
                          "Je suis à Babi depuis hier.", "Je suis à Yop, côté Siporex.", "Pardon, aide-moi.",
                          "Je veux béou, c'est urgent.", "Y'a bouchon sur le pont ?", "Côté Plateau, ça roule ?"]),
    ("incidents", ["Il y a un accident devant.", "La route est barrée.", "La route est remplie d'eau.", "Il y a un contrôle de police."]),
    ("réponses courtes", ["Oui.", "Non.", "Oui, c'est ça.", "Non, pas ça.", "D'accord.", "Ya foye, on y va.", "Non merci."]),
]


def main() -> None:
    resolver = PlaceResolver(config.GAZETTEER_PATH, config.LIEUX_COMPLEMENTS)
    rng = random.Random(20261020)
    test_texts = {norm(row["texte"]) for row in csv.DictReader(TEST.open(encoding="utf-8"), delimiter=";")}

    canonical = {}
    for name in PRIORITE_1 + PRIORITE_2:
        top = resolver.resolve(name)[0]
        if top.score < 95:
            sys.exit(f"Lieu introuvable dans le répertoire : {name} (le plus proche : {top.canonical})")
        canonical[name] = top.canonical

    rows, seen = [], set()

    def add(text: str, lieu: str = "") -> bool:
        key = norm(text)
        if key in seen or key in test_texts:
            return False
        seen.add(key)
        rows.append({"fichier": f"E{len(rows) + 1:03d}", "texte": text, "lieu": lieu})
        return True

    origins = PRIORITE_1[12:]  # les communes servent de point de départ
    for name in PRIORITE_1 + PRIORITE_2:
        templates = rng.sample(DESTINATION, len(DESTINATION))
        added = 0
        for template in templates:
            origin = rng.choice([o for o in origins if o != name])
            d, o = forms(name), forms(origin)
            text = template.format(a=d["a"], pour=d["pour"], Pour=d["pour"][0].upper() + d["pour"][1:],
                                   o_seul=o["seul"], o_a=o["a"])
            if add(text, canonical[name]):
                added += 1
            if added == 3:
                break
    for _, phrases in VOCABULAIRE:
        for phrase in phrases:
            add(phrase)

    with OUT.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["fichier", "texte", "lieu"], delimiter=";")
        writer.writeheader()
        writer.writerows(rows)

    # La page d'enregistrement embarque la liste (une page ouverte en fichier local ne peut pas lire un CSV voisin).
    page = Path(__file__).with_name("enregistreur_simple.html")
    html = page.read_text(encoding="utf-8")
    start = html.index("// ENTRAINEMENT:DEBUT")
    start = html.index("\n", start) + 1
    end = html.index("// ENTRAINEMENT:FIN")
    listing = "\n".join(f"{row['fichier']};{row['texte'].replace('`', '')};{row['lieu']}" for row in rows)
    html = html[:start] + f"const ENTRAINEMENT = `{listing}`;\n" + html[end:]
    # Onglet « Voix de SIRA » : le script de lecture de Piper (script_voix.csv, « id;texte »), tel quel.
    piper = [row for row in csv.reader(Path(__file__).with_name("script_voix.csv").open(encoding="utf-8-sig"), delimiter=";")
             if len(row) >= 2 and row[0].strip().lower() not in {"id", "identifiant"}]
    start = html.index("\n", html.index("// PIPER:DEBUT")) + 1
    end = html.index("// PIPER:FIN")
    listing = "\n".join(f"{pid.strip()};{text.strip().replace('`', '')}" for pid, text, *_ in piper)
    page.write_text(html[:start] + f"const PIPER = `{listing}`;\n" + html[end:], encoding="utf-8")
    print(f"Page d'enregistrement mise à jour : {len(rows)} phrases d'entraînement, {len(piper)} phrases de la voix de SIRA")

    words = Counter()
    for row in rows:
        for name in PRIORITE_1 + PRIORITE_2:
            if norm(SPOKEN.get(name, name)) in norm(row["texte"]):
                words[name] += 1
    seconds = sum(len(row["texte"].split()) for row in rows) / 2.5 + 2 * len(rows)  # ≈ 2,5 mots/s + pause
    print(f"{len(rows)} phrases écrites dans {OUT.relative_to(ROOT)} (≈ {seconds / 60:.0f} min d'enregistrement par personne)")
    print("Lieux cités moins de 3 fois :", [n for n in PRIORITE_1 + PRIORITE_2 if words[n] < 3] or "aucun")


if __name__ == "__main__":
    main()
