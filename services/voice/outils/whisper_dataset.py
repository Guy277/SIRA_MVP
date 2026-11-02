"""SIRA — préparer les enregistrements d'entraînement pour affiner Whisper (notebook entrainement_whisper_sira.ipynb).

Entrée : les lots « entraînement » de la page d'enregistrement (enregistreur_simple.html), tels qu'ils arrivent :
  services/voice/enregistrements/SIRA_entrainement_voix_<prénom>_<date>.zip   (E001.wav … + attendu.csv)
ou déjà dézippés dans un dossier qui contient attendu.csv. Les lots de TEST ne sont jamais pris : ni les zips
SIRA_test_voix_*, ni le dossier enregistrements/test/, ni un dossier de phrases T01…T40. Ils servent à mesurer.

Sortie (un seul zip à mettre dans le Drive, dossier SIRA_voix) :
  dataset_whisper_sira.zip
    audio/<locuteur>_E001.wav   16 kHz, mono, 16 bits (ce que Whisper lit)
    metadata.csv                fichier;texte;locuteur;phrase;partie   (partie = entrainement ou validation)
    rapport.txt                 durée par locuteur et par partie

Validation : 10 % des PHRASES (les mêmes pour tous les locuteurs) sont mises de côté. Le modèle ne les entend
jamais à l'entraînement : elles disent s'il a appris le parler d'Abidjan ou seulement ces phrases-là.

Lancement depuis la racine du projet (environnement de la voix, qui a déjà faster-whisper pour lire l'audio) :
  services/voice/.venv/Scripts/python services/voice/outils/whisper_dataset.py
  services/voice/.venv/Scripts/python services/voice/outils/whisper_dataset.py --entree services/voice/enregistrements --sortie dataset_whisper_sira.zip
Aucune donnée ne quitte l'ordinateur : c'est toi qui déposes le zip dans ton Drive.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import re
import sys
import wave
import zipfile
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
SR = 16_000
VALIDATION_SHARE = 0.10
MIN_S, MAX_S = 0.5, 30.0  # Whisper lit des fenêtres de 30 s au plus
_ZIP_NAME = re.compile(r"SIRA_entrainement_voix_(?P<who>.+?)_(?P<date>\d{4}-\d{2}-\d{2})\.zip$", re.I)
_TEST = re.compile(r"(^|[\\/])test([\\/]|$)|SIRA_test_voix_", re.I)


def decode(data: bytes) -> np.ndarray:
    from faster_whisper import decode_audio
    return decode_audio(io.BytesIO(data), sampling_rate=SR)  # float32 mono, quel que soit le format d'origine


def wav_bytes(audio: np.ndarray) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
    return buffer.getvalue()


def read_expected(text: str) -> list[dict]:
    rows = []
    for row in csv.DictReader(io.StringIO(text.lstrip("﻿")), delimiter=";"):
        name, sentence = (row.get("fichier") or "").strip(), (row.get("texte") or "").strip()
        if name and sentence:
            rows.append({"fichier": Path(name).stem, "texte": sentence})
    return rows


def speaker_of(name: str) -> str:
    """« SIRA_entrainement_voix_FRANCK2_2026-10-24 » → « franck » : une même personne enregistrée deux fois reste une personne."""
    who = re.sub(r"^SIRA_(entrainement|test)_voix_", "", Path(name).stem, flags=re.I)
    who = re.sub(r"[_-]\d{4}-\d{2}-\d{2}$", "", who)  # « Ange_2026-10-20 » → « Ange »
    return re.sub(r"\d+$", "", re.sub(r"[^a-z0-9-]+", "-", who.lower())).strip("-") or "inconnu"


def sources(entree: Path) -> list[tuple[str, Path]]:
    """Lots d'entraînement trouvés : (locuteur, zip ou dossier), jamais un lot de test."""
    found = []
    for path in sorted(entree.rglob("*")):
        if _TEST.search(str(path.relative_to(entree))):
            continue
        if path.is_file() and _ZIP_NAME.search(path.name):
            found.append((speaker_of(path.name), path))
        elif path.is_file() and path.name == "attendu.csv":
            folder = path.parent
            if any(p.stem.upper().startswith("T") and p.stem[1:].isdigit() for p in folder.glob("*.wav")):
                continue  # phrases d'examen T01…T40 : c'est un lot de test
            if any(folder == z.parent and z.suffix == ".zip" for _, z in found):
                continue
            found.append((speaker_of(folder.name), folder))
    return found


def items(source: Path):
    """(nom, octets audio, texte) de chaque phrase d'un lot, zip ou dossier."""
    if source.is_dir():
        expected = read_expected((source / "attendu.csv").read_text(encoding="utf-8-sig"))
        for row in expected:
            audio = next((p for p in source.glob(f"{row['fichier']}.*") if p.suffix.lower() != ".csv"), None)
            yield row["fichier"], audio.read_bytes() if audio else None, row["texte"]
        return
    with zipfile.ZipFile(source) as z:
        names = {Path(n).stem: n for n in z.namelist() if not n.endswith("/") and not n.lower().endswith(".csv")}
        csv_name = next((n for n in z.namelist() if Path(n).name == "attendu.csv"), None)
        if csv_name is None:
            print(f"  ! {source.name} : pas de attendu.csv, lot ignoré")
            return
        for row in read_expected(z.read(csv_name).decode("utf-8-sig")):
            name = names.get(row["fichier"])
            yield row["fichier"], z.read(name) if name else None, row["texte"]


def validation_phrases(texts: list[str]) -> set[str]:
    """10 % des phrases, toujours les mêmes d'une fois à l'autre (tirage fixé par le texte lui-même)."""
    keyed = sorted(set(texts), key=lambda t: hashlib.sha1(t.encode("utf-8")).hexdigest())
    return set(keyed[: max(1, round(len(keyed) * VALIDATION_SHARE))])


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Prépare le zip d'entraînement de Whisper (voix d'Abidjan).")
    parser.add_argument("--entree", type=Path, default=ROOT / "services" / "voice" / "enregistrements")
    parser.add_argument("--sortie", type=Path, default=Path("dataset_whisper_sira.zip"))
    args = parser.parse_args()

    lots = sources(args.entree)
    if not lots:
        sys.exit(f"Aucun lot d'entraînement dans {args.entree} (SIRA_entrainement_voix_<prénom>_<date>.zip ou dossier avec attendu.csv).")
    rows, problems = [], []
    for who, source in lots:
        print(f"[SIRA] {source.name} → locuteur « {who} »")
        for name, data, text in items(source):
            if data is None:
                problems.append(f"{source.name}/{name} : audio absent"); continue
            try:
                audio = decode(data)
            except Exception as error:  # fichier abîmé
                problems.append(f"{source.name}/{name} : illisible ({error})"); continue
            seconds = len(audio) / SR
            if not MIN_S <= seconds <= MAX_S:
                problems.append(f"{source.name}/{name} : {seconds:.1f} s, hors limites"); continue
            if np.abs(audio).max() < 0.01:
                problems.append(f"{source.name}/{name} : silence"); continue
            rows.append({"fichier": f"audio/{who}_{name}.wav", "texte": text, "locuteur": who, "phrase": name,
                         "audio": audio, "secondes": seconds})

    # Un même locuteur enregistré deux fois (« FRANCK », « FRANCK2 ») : sa dernière prise d'une phrase gagne.
    unique = {}
    for row in rows:
        unique[row["fichier"]] = row
    rows = list(unique.values())
    held_out = validation_phrases([r["texte"] for r in rows])
    for row in rows:
        row["partie"] = "validation" if row["texte"] in held_out else "entrainement"

    totals = defaultdict(float)
    with zipfile.ZipFile(args.sortie, "w", zipfile.ZIP_DEFLATED) as z:
        table = io.StringIO()
        writer = csv.DictWriter(table, fieldnames=["fichier", "texte", "locuteur", "phrase", "partie"], delimiter=";",
                                extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        for row in sorted(rows, key=lambda r: r["fichier"]):
            z.writestr(row["fichier"], wav_bytes(row["audio"]))
            writer.writerow(row)
            totals[(row["locuteur"], row["partie"])] += row["secondes"]
        z.writestr("metadata.csv", table.getvalue())
        lines = ["Jeu de données Whisper SIRA", ""]
        for who in sorted({k[0] for k in totals}):
            lines.append(f"{who:>12} : entraînement {totals[(who, 'entrainement')] / 60:5.1f} min · "
                         f"validation {totals[(who, 'validation')] / 60:4.1f} min")
        train = sum(v for k, v in totals.items() if k[1] == "entrainement")
        valid = sum(v for k, v in totals.items() if k[1] == "validation")
        lines += ["", f"Total : {train / 60:.1f} min d'entraînement, {valid / 60:.1f} min de validation "
                  f"({len(held_out)} phrases jamais entendues à l'entraînement), {len(rows)} enregistrements.",
                  f"Écartés : {len(problems)}", *problems]
        z.writestr("rapport.txt", "\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"\n[SIRA] Zip prêt : {args.sortie.resolve()}  → à déposer dans le Drive, dossier SIRA_voix")


if __name__ == "__main__":
    main()
