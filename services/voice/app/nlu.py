"""Chargement des deux modèles CamemBERTv2 fine-tunés (intent + entités) et prédiction."""
from __future__ import annotations

from pathlib import Path
from typing import Protocol

SPECIAL_TOKENS = {"cls_token": "[CLS]", "sep_token": "[SEP]", "pad_token": "[PAD]", "unk_token": "[UNK]", "mask_token": "[MASK]"}
STRIP_CHARS = " ,.;:?!'\""


class NLUModel(Protocol):
    def predict(self, text: str) -> tuple[str, float, list[dict]]: ...


def load_tokenizer(model_dir: Path):
    """Charge tokenizer.json directement (évite le bug transformers ≥ 5 qui découpait CamemBERTv2 lettre par lettre)."""
    from transformers import PreTrainedTokenizerFast

    tok = PreTrainedTokenizerFast(tokenizer_file=str(Path(model_dir) / "tokenizer.json"), model_max_length=512, **SPECIAL_TOKENS)
    sample = tok.tokenize("Je veux aller au Plateau")
    if len(sample) > 10:
        raise RuntimeError(f"Tokenizer invalide dans {model_dir} (découpage lettre par lettre : {sample})")
    return tok


class CamembertNLU:
    def __init__(self, intent_dir: Path, ner_dir: Path, max_length: int = 64):
        import torch
        from transformers import AutoModelForSequenceClassification, AutoModelForTokenClassification

        for d in (intent_dir, ner_dir):
            if not (Path(d) / "model.safetensors").exists():
                raise FileNotFoundError(f"Modèle introuvable : {d} (copie le dossier sira_models_v0.4, voir services/voice/README.md)")
        self.torch = torch
        torch.set_num_threads(max(1, min(4, torch.get_num_threads())))
        self.tok = load_tokenizer(intent_dir)
        self.intent_model = AutoModelForSequenceClassification.from_pretrained(intent_dir).eval()
        self.ner_model = AutoModelForTokenClassification.from_pretrained(ner_dir).eval()
        self.intents = self.intent_model.config.id2label
        self.bio = self.ner_model.config.id2label
        self.max_length = max_length

    def predict(self, text: str) -> tuple[str, float, list[dict]]:
        torch = self.torch
        enc = self.tok(text, truncation=True, max_length=self.max_length, return_offsets_mapping=True, return_tensors="pt")
        offsets = enc.pop("offset_mapping")[0].tolist()
        enc.pop("token_type_ids", None)
        with torch.inference_mode():
            intent_prob = torch.softmax(self.intent_model(**enc).logits[0], -1)
            ner_prob = torch.softmax(self.ner_model(**enc).logits[0], -1).numpy()
        idx = int(intent_prob.argmax())
        return self.intents[idx], float(intent_prob[idx]), decode_entities(text, offsets, ner_prob, self.bio)


def decode_entities(text: str, offsets, probs, bio: dict) -> list[dict]:
    """Regroupe les étiquettes B-/I- des sous-mots en entités avec leurs positions dans le texte."""
    spans, current = [], None
    for (start, end), p in zip(offsets, probs):
        if start == end:
            continue
        tag = bio[int(p.argmax())]
        if tag == "O":
            current = None
            continue
        prefix, label = tag.split("-", 1)
        if current and label == current["label"] and (prefix == "I" or start == current["end"]):
            current["end"] = end
            current["scores"].append(float(p.max()))
        else:
            current = {"label": label, "start": start, "end": end, "scores": [float(p.max())]}
            spans.append(current)
    out = []
    for c in spans:
        s, e = c["start"], c["end"]
        while s < e and text[s] in STRIP_CHARS:
            s += 1
        while e > s and text[e - 1] in STRIP_CHARS.replace("'", ""):
            e -= 1
        if e > s:
            out.append({"label": c["label"], "start": s, "end": e, "text": text[s:e],
                        "score": round(sum(c["scores"]) / len(c["scores"]), 3)})
    return out
