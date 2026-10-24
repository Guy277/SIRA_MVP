"""SIRA — préparer un dataset Piper (voix ivoirienne de SIRA) à partir des enregistrements.

Deux façons d'enregistrer, un seul résultat (format LJSpeech attendu par piper_train) :

  dataset_piper/
    wavs/SIRA_0001.wav ...      22 050 Hz, mono, 16 bits, silences coupés, volume normalisé
    metadata.csv                SIRA_0001|Pour aller à Siporex, prends le gbaka.
    rapport_qualite.csv         durée, niveau, saturation, score de correspondance, à vérifier ?

1) Phrase par phrase : page enregistreur_simple.html, onglet « Voix de SIRA » (une seule personne, au calme).
   Le ZIP SIRA_piper_voix_<prénom>_<date>.zip se range avec  npm run voice:import  dans
   services/voice/enregistrements/piper/<prénom>_<date>/ (wavs/ + metadata.csv), puis :
     python piper_dataset.py preparer --entree ../enregistrements/piper/<prénom>_<date>/ --sortie dataset_piper/

2) Un long enregistrement avec des pauses (1 à 2 s entre les phrases) :
     python piper_dataset.py decouper --audio seance1.wav --script script_voix.csv --sortie dataset_piper/
        [--marqueurs seance1_marqueurs.csv]   # « id;seconde » de début de chaque phrase, si on les a notés
        [--whisper small]                     # sinon : Whisper retrouve quelle phrase a été lue
        [--mots]                              # lecture enchaînée sans vraies pauses : alignement mot à mot
        [--ordre]                           # sinon : les morceaux sont pris dans l'ordre du script
        [--depuis SIRA_0051 --jusqua SIRA_0100]  # la prise ne contient qu'une partie du script (document Word)
   Le script lu = un CSV « id;texte » (ou « id|texte ») dans l'ordre de lecture.

3) Zip pour l'entraînement sur Colab (notebook entrainement_voix_sira.ipynb) :
     python piper_dataset.py emballer --dataset dataset_piper/ --sortie dataset_piper_sira.zip

Découpage : Silero VAD (inclus dans faster-whisper, déjà installé pour le service vocal).
Aucune donnée ne quitte l'ordinateur.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
import unicodedata
import wave
from pathlib import Path

import numpy as np
from faster_whisper import decode_audio
from faster_whisper.vad import VadOptions, get_speech_timestamps

SR = 22050                 # fréquence attendue par Piper (qualité « medium »)
VAD_SR = 16000             # Silero travaille à 16 kHz
PAD_S = 0.15               # marge de silence gardée avant/après chaque phrase
MIN_S, MAX_S = 0.6, 15.0   # durées acceptées par phrase
PEAK_TARGET = 10 ** (-1.0 / 20)   # normalisation à -1 dBFS


# ---------- outils audio ----------
def load(path: Path, sr: int) -> np.ndarray:
    return decode_audio(str(path), sampling_rate=sr)          # float32 mono


def save_wav(path: Path, audio: np.ndarray, sr: int = SR) -> None:
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())


def speech_spans(audio16: np.ndarray, min_silence_ms: int) -> list[tuple[float, float]]:
    """Zones de parole (en secondes) détectées par Silero VAD."""
    opts = VadOptions(threshold=0.5, min_speech_duration_ms=250, min_silence_duration_ms=min_silence_ms,
                      speech_pad_ms=60, max_speech_duration_s=MAX_S + 5)
    return [(s["start"] / VAD_SR, s["end"] / VAD_SR) for s in get_speech_timestamps(audio16, vad_options=opts)]


def trim_and_normalize(audio: np.ndarray, sr: int = SR) -> tuple[np.ndarray, dict]:
    """Coupe les silences de début et de fin (VAD), garde une petite marge, normalise le volume."""
    a16 = decode_audio_array(audio, sr)
    spans = speech_spans(a16, min_silence_ms=300)
    info = {"clipping": bool(np.mean(np.abs(audio) > 0.995) > 0.0005), "peak_dbfs": round(20 * np.log10(max(np.abs(audio).max(), 1e-9)), 1)}
    if spans:
        start = max(0.0, spans[0][0] - PAD_S); end = min(len(audio) / sr, spans[-1][1] + PAD_S)
        audio = audio[int(start * sr): int(end * sr)]
    else:
        info["no_speech"] = True
    peak = np.abs(audio).max() if len(audio) else 0
    if peak > 0:
        audio = audio * (PEAK_TARGET / peak)
    info["duration_s"] = round(len(audio) / sr, 2)
    return audio.astype(np.float32), info


def decode_audio_array(audio: np.ndarray, sr: int) -> np.ndarray:
    """Rééchantillonne un tableau vers 16 kHz pour le VAD (interpolation linéaire, suffisant pour détecter la voix)."""
    if sr == VAD_SR:
        return audio
    n = int(len(audio) * VAD_SR / sr)
    return np.interp(np.linspace(0, len(audio) - 1, n), np.arange(len(audio)), audio).astype(np.float32)


# ---------- textes ----------
def read_script(path: Path) -> list[tuple[str, str]]:
    raw = path.read_text(encoding="utf-8-sig").splitlines()
    rows = []
    for line in raw:
        if not line.strip():
            continue
        sep = "|" if "|" in line else ";" if ";" in line else ","
        parts = next(csv.reader([line], delimiter=sep))
        if len(parts) < 2 or parts[0].lower() in {"id", "identifiant"}:
            continue
        rows.append((parts[0].strip(), parts[1].strip()))
    if not rows:
        sys.exit(f"Aucune phrase lue dans {path} (attendu : id;texte)")
    return rows


def norm(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9 ]+", " ", text).strip()


_UNITS = "zero un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize".split()
_TENS = {2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante"}


def fr_number(n: int) -> str:
    """Nombre en toutes lettres (Whisper écrit « 700 », le script « sept cents »)."""
    if n < 17: return _UNITS[n]
    if n < 20: return "dix " + _UNITS[n - 10]
    if n < 70:
        t, u = divmod(n, 10)
        return _TENS[t] + ("" if u == 0 else " et un" if u == 1 else " " + _UNITS[u])
    if n < 80: return "soixante " + ("et onze" if n == 71 else fr_number(n - 60))
    if n < 100: return "quatre vingt" + ("s" if n == 80 else " " + fr_number(n - 80))
    if n < 1000:
        c, r = divmod(n, 100)
        head = "cent" if c == 1 else _UNITS[c] + " cent" + ("s" if r == 0 else "")
        return head + ("" if r == 0 else " " + fr_number(r))
    if n < 1_000_000:
        m, r = divmod(n, 1000)
        return ("mille" if m == 1 else fr_number(m) + " mille") + ("" if r == 0 else " " + fr_number(r))
    return str(n)


def words_of(text: str) -> list[str]:
    return norm(re.sub(r"\d+", lambda m: f" {fr_number(int(m.group()))} ", text)).split()


def clean_for_piper(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("|", " ")).strip()


# ---------- écriture du dataset ----------
class Dataset:
    def __init__(self, out: Path):
        self.out = out; (out / "wavs").mkdir(parents=True, exist_ok=True)
        self.meta: dict[str, str] = {}
        self.report: list[dict] = []
        mp = out / "metadata.csv"
        if mp.exists():   # on complète un dataset existant (plusieurs séances)
            for line in mp.read_text(encoding="utf-8").splitlines():
                if "|" in line:
                    k, v = line.split("|", 1); self.meta[k] = v

    def add(self, pid: str, text: str, audio: np.ndarray, extra: dict | None = None) -> None:
        audio, info = trim_and_normalize(audio)
        info.update(extra or {})
        problems = []
        if info.get("no_speech"): problems.append("aucune parole détectée")
        if info["duration_s"] < MIN_S: problems.append("trop court")
        if info["duration_s"] > MAX_S: problems.append("trop long (> 15 s)")
        if info["clipping"]: problems.append("saturation : baisser le gain du micro")
        if info["peak_dbfs"] < -30: problems.append("enregistrement très faible")
        if info.get("score") is not None and info["score"] < 75: problems.append("correspondance douteuse : écouter")
        if info.get("rythme") is not None and not 0.7 <= info["rythme"] <= 1.45: problems.append("durée anormale pour ce texte : phrase coupée ?")
        save_wav(self.out / "wavs" / f"{pid}.wav", audio)
        self.meta[pid] = clean_for_piper(text)
        self.report.append({"id": pid, "texte": text, **{k: info.get(k) for k in ("duration_s", "peak_dbfs", "clipping", "score", "source")},
                            "a_verifier": "; ".join(problems)})

    def close(self) -> None:
        with open(self.out / "metadata.csv", "w", encoding="utf-8", newline="\n") as f:
            for k in sorted(self.meta):
                f.write(f"{k}|{self.meta[k]}\n")
        rp = self.out / "rapport_qualite.csv"
        new = not rp.exists()
        with open(rp, "a", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=["id", "texte", "duration_s", "peak_dbfs", "clipping", "score", "source", "a_verifier"], delimiter=";")
            if new: w.writeheader()
            w.writerows(self.report)
        total = sum(r["duration_s"] or 0 for r in self.report)
        flagged = sum(1 for r in self.report if r["a_verifier"])
        print(f"[SIRA] {len(self.report)} phrases ajoutées ({total / 60:.1f} min), {flagged} à vérifier.")
        print(f"[SIRA] Dataset : {self.out}  ({len(self.meta)} phrases au total dans metadata.csv)")


# ---------- mode 1 : phrase par phrase ----------
def cmd_preparer(args) -> None:
    src = Path(args.entree)
    meta_file = src / "metadata.csv"
    if not meta_file.exists():
        sys.exit("metadata.csv introuvable dans le dossier d'export (dézippe d'abord l'export de la page).")
    script = read_script(meta_file)
    ds = Dataset(Path(args.sortie))
    for pid, text in script:
        wav = src / "wavs" / f"{pid}.wav"
        if not wav.exists():
            print(f"  - {pid} : fichier absent, ignoré"); continue
        ds.add(pid, text, load(wav, SR), {"source": wav.name})
    ds.close()


# ---------- mode 2 : long enregistrement ----------
def segments_by_markers(spans, markers, total_s, gap_s=1.0):
    """Chaque marqueur ouvre l'intervalle d'une prise ; la parole de cet intervalle lui appartient.
    Une phrase marquée plusieurs fois (touche « Refaire ») : la dernière prise gagne.
    Dans un intervalle, des morceaux séparés de plus de gap_s sont des reprises : on garde le dernier bloc."""
    takes = [(pid, t, markers[i + 1][1] if i + 1 < len(markers) else total_s) for i, (pid, t) in enumerate(markers)]
    result: dict[str, tuple[float, float]] = {}
    for pid, a, b in takes:
        inside = [(max(s, a), min(e, b)) for s, e in spans if min(e, b) - max(s, a) > 0.2]
        if not inside:
            continue
        blocks = [list(inside[0])]
        for s, e in inside[1:]:
            if s - blocks[-1][1] <= gap_s:
                blocks[-1][1] = e
            else:
                blocks.append([s, e])
        result[pid] = tuple(blocks[-1])
    return result


def segments_by_whisper(spans, audio16, script, model_name):
    from faster_whisper import WhisperModel
    from rapidfuzz import fuzz
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    texts = [norm(t) for _, t in script]

    def transcribe(s, e):
        seg = audio16[int(s * VAD_SR): int(e * VAD_SR)]
        res, _ = model.transcribe(seg, language="fr", beam_size=1, vad_filter=False, condition_on_previous_text=False)
        return norm(" ".join(r.text for r in res))

    result: dict[str, tuple[float, float, float]] = {}
    pos, i = 0, 0
    while i < len(spans):
        s, e = spans[i]
        hyp1 = transcribe(s, e)
        cand = []
        for j in range(max(0, pos - 2), min(len(script), pos + 6)):   # fenêtre autour de la phrase attendue
            cand.append((fuzz.ratio(hyp1, texts[j]), j, 1))
        if i + 1 < len(spans) and spans[i + 1][0] - e < 1.2:            # phrase coupée en deux par une petite pause ?
            hyp2 = transcribe(s, spans[i + 1][1])
            for j in range(max(0, pos - 2), min(len(script), pos + 6)):
                cand.append((fuzz.ratio(hyp2, texts[j]), j, 2))
        score, j, used = max(cand)
        if score >= 55:
            end = spans[i + used - 1][1]
            result[script[j][0]] = (s, end, score)   # une relecture remplace la précédente
            pos = j + 1
        i += used
    return result


def segments_by_words(audio16, script, model_name):
    """Lecture enchaînée : Whisper horodate chaque mot, on recale ces mots sur le script,
    puis on coupe entre deux phrases au plus grand silence qui les sépare."""
    from difflib import SequenceMatcher
    from faster_whisper import WhisperModel
    from rapidfuzz import fuzz
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    res, _ = model.transcribe(audio16, language="fr", beam_size=5, word_timestamps=True, vad_filter=True,
                              initial_prompt=" ".join(t for _, t in script[:4]))   # noms d'Abidjan : aide Whisper
    hyp = [(tok, w.start, w.end) for seg in res for w in seg.words for tok in words_of(w.word)]
    ref, owner = [], []
    for k, (_, text) in enumerate(script):
        toks = words_of(text); ref += toks; owner += [k] * len(toks)
    first, last, hits = {}, {}, [0] * len(script)
    ref_first, ref_last = {}, {}   # position dans la phrase du premier / dernier mot retrouvé
    starts = {k: owner.index(k) for k in set(owner)}
    for a, b, n in SequenceMatcher(None, ref, [h[0] for h in hyp], autojunk=False).get_matching_blocks():
        for d in range(n):
            k = owner[a + d]
            first.setdefault(k, b + d); last[k] = b + d; hits[k] += 1
            ref_first.setdefault(k, a + d - starts[k]); ref_last[k] = a + d - starts[k]
    size = {k: owner.count(k) for k in set(owner)}
    # mots du script non retrouvés en fin / début de phrase (souvent un nom de lieu que Whisper écorche)
    tail = {k: size[k] - 1 - ref_last[k] for k in first}
    head = {k: ref_first[k] for k in first}
    # moins de 40 % des mots retrouvés : phrase pas lue (ou sautée), ses rares mots « trouvés » sont du hasard
    ks = [k for k in sorted(first) if hits[k] >= 0.4 * size[k]]
    if not ks:
        return {}
    cuts = []   # indice du premier mot de la phrase suivante
    for k, k2 in zip(ks, ks[1:]):
        lo, hi = last[k] + 1, max(first[k2], last[k] + 1)
        # les mots non reconnus entre deux phrases se partagent selon les mots manquants de chaque côté,
        # puis on cale la coupe sur le silence le plus long autour de ce point
        u1, u2 = tail[k], head[k2]
        expected = lo + round((hi - lo) * u1 / (u1 + u2)) if u1 + u2 else lo
        cuts.append(max(range(lo, hi + 1), key=lambda j: (hyp[j][1] - hyp[j - 1][2] if j < len(hyp) else -1) - 0.25 * abs(j - expected)))
    result: dict[str, tuple[float, float, float]] = {}
    for i, k in enumerate(ks):
        j0 = max(0, first[k] - head[k]) if i == 0 else cuts[i - 1]
        j1 = min(len(hyp) - 1, last[k] + tail[k]) if i == len(ks) - 1 else cuts[i] - 1
        s, e = hyp[j0][1], hyp[j1][2]
        if j0 > 0: s = max(s, (hyp[j0 - 1][2] + s) / 2 + PAD_S)               # ne pas mordre la phrase d'avant
        if j1 + 1 < len(hyp): e = min(e, (e + hyp[j1 + 1][1]) / 2 - PAD_S)    # ni celle d'après
        if e - s < MIN_S: s, e = hyp[j0][1], hyp[j1][2]
        score = fuzz.ratio(" ".join(h[0] for h in hyp[j0: j1 + 1]), " ".join(words_of(script[k][1])))
        result[script[k][0]] = (s, e, score)
    return result


def cmd_decouper(args) -> None:
    audio_path = Path(args.audio)
    script = read_script(Path(args.script))
    ids = [pid for pid, _ in script]
    a = ids.index(args.depuis) if args.depuis in ids else 0
    b = ids.index(args.jusqua) + 1 if args.jusqua in ids else len(script)
    if (args.depuis and args.depuis not in ids) or (args.jusqua and args.jusqua not in ids):
        sys.exit("Identifiant --depuis ou --jusqua introuvable dans le script.")
    script = script[a:b]   # seulement les phrases lues dans cette prise
    audio16 = load(audio_path, VAD_SR)
    audio = load(audio_path, SR)
    spans = speech_spans(audio16, min_silence_ms=args.pause_ms)
    total = len(audio16) / VAD_SR
    print(f"[SIRA] {audio_path.name} : {total / 60:.1f} min, {len(spans)} zones de parole détectées, {len(script)} phrases attendues.")

    if args.marqueurs:
        marks = [(pid, float(t)) for pid, t in read_script(Path(args.marqueurs))]
        found = {pid: (s, e, None) for pid, (s, e) in segments_by_markers(spans, marks, total).items()}
        source = "marqueurs"
    elif args.mots:
        found = segments_by_words(audio16, script, args.whisper)
        source = "mots"
    elif args.ordre:
        if len(spans) != len(script):
            print(f"[SIRA] ⚠️ {len(spans)} zones pour {len(script)} phrases : l'ordre seul n'est pas fiable. "
                  "Utilise --whisper ou ajuste --pause-ms.")
        found = {script[k][0]: (s, e, None) for k, (s, e) in enumerate(spans[: len(script)])}
        source = "ordre"
    else:
        found = segments_by_whisper(spans, audio16, script, args.whisper)
        source = "whisper"

    texts = dict(script)
    # débit de lecture (secondes par lettre) : une phrase bien plus rapide ou lente que la médiane a été mal coupée
    rates = sorted((e - s) / max(len(norm(texts[pid])), 1) for pid, (s, e, _) in found.items())
    median = rates[len(rates) // 2] if rates else 0
    ds = Dataset(Path(args.sortie))
    for pid, (s, e, score) in found.items():
        a, b = max(0, int((s - PAD_S) * SR)), min(len(audio), int((e + PAD_S) * SR))
        rhythm = (e - s) / max(len(norm(texts[pid])), 1) / median if median else None
        ds.add(pid, texts[pid], audio[a:b], {"score": None if score is None else round(score, 1), "rythme": rhythm,
                                             "source": f"{audio_path.name} {s:.1f}-{e:.1f}s ({source})"})
    missing = [pid for pid, _ in script if pid not in found]
    if missing:
        print(f"[SIRA] {len(missing)} phrase(s) non retrouvée(s) : {', '.join(missing[:15])}{' …' if len(missing) > 15 else ''}")
    ds.close()


def cmd_emballer(args) -> None:
    """Zip à déposer dans le Drive pour le notebook Colab (entrainement_voix_sira.ipynb).
    Les phrases signalées « à vérifier » sont écartées : mieux vaut 90 phrases propres que 100 avec des erreurs."""
    import zipfile
    src = Path(args.dataset)
    meta = dict(line.split("|", 1) for line in (src / "metadata.csv").read_text(encoding="utf-8").splitlines() if "|" in line)
    flags: dict[str, str] = {}
    rp = src / "rapport_qualite.csv"
    if rp.exists():
        with open(rp, encoding="utf-8-sig") as f:
            for r in csv.DictReader(f, delimiter=";"):
                flags[r["id"]] = r["a_verifier"]   # la dernière séance gagne
    excluded = {pid.strip() for pid in (args.exclure or "").split(",") if pid.strip()}
    for pid in excluded:
        flags[pid] = "exclue à la main (après écoute)"
    keep = [pid for pid in sorted(meta) if pid not in excluded and (args.garder_douteux or not flags.get(pid))]
    for pid in sorted(meta):
        if pid not in keep:
            print(f"  - {pid} écartée : {flags[pid]}")
    with zipfile.ZipFile(args.sortie, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("metadata.csv", "".join(f"{pid}|{meta[pid]}\n" for pid in keep))
        for pid in keep:
            z.write(src / "wavs" / f"{pid}.wav", f"wavs/{pid}.wav")
    print(f"[SIRA] {len(keep)} phrases sur {len(meta)} dans {args.sortie}")


def main() -> None:
    p = argparse.ArgumentParser(description="Préparer le dataset Piper de la voix SIRA")
    sub = p.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("preparer", help="export phrase par phrase de la page d'enregistrement")
    a.add_argument("--entree", required=True); a.add_argument("--sortie", default="dataset_piper")
    b = sub.add_parser("decouper", help="un long enregistrement avec des pauses")
    b.add_argument("--audio", required=True); b.add_argument("--script", required=True)
    b.add_argument("--sortie", default="dataset_piper"); b.add_argument("--marqueurs")
    b.add_argument("--ordre", action="store_true"); b.add_argument("--whisper", default="small")
    b.add_argument("--mots", action="store_true", help="alignement mot à mot (lecture sans vraies pauses)")
    b.add_argument("--depuis", help="première phrase de la prise, ex. SIRA_0051")
    b.add_argument("--jusqua", help="dernière phrase de la prise, ex. SIRA_0100")
    b.add_argument("--pause-ms", type=int, default=700, help="silence minimum entre deux phrases (ms)")
    c = sub.add_parser("emballer", help="zip du dataset pour le notebook Colab")
    c.add_argument("--dataset", default="dataset_piper"); c.add_argument("--sortie", default="dataset_piper_sira.zip")
    c.add_argument("--garder-douteux", action="store_true", help="garder aussi les phrases « à vérifier »")
    c.add_argument("--exclure", help="phrases à écarter après écoute, ex. SIRA_0074,SIRA_0081")
    args = p.parse_args()
    {"preparer": cmd_preparer, "decouper": cmd_decouper, "emballer": cmd_emballer}[args.cmd](args)


if __name__ == "__main__":
    main()
