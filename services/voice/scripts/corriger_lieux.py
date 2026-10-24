"""Recalcule la commune de chaque lieu de la voix à partir des vraies frontières des communes (OpenStreetMap).

Le répertoire du notebook (gazetteer_v0.4.json) devine la commune d'environ 1 600 arrêts d'après le centre de commune
le plus proche (« needs_review ») : un arrêt près d'une limite tombait dans la mauvaise commune. Ce script place chaque
lieu (répertoire + ajouts de knowledge/lieux_complements.json) dans le polygone de sa commune et réécrit la section
« communes » de lieux_complements.json. Les sections écrites à la main (ajouts, coordonnees, alias) ne sont pas touchées.

Les frontières sont téléchargées une fois depuis Nominatim (1 requête par seconde), puis gardées dans
services/models/voice/communes_abidjan.geojson (hors Git).

Lancement depuis la racine du projet :
  services/voice/.venv/Scripts/python services/voice/scripts/corriger_lieux.py          (Windows)
  services/voice/.venv/bin/python services/voice/scripts/corriger_lieux.py              (Linux)
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(PROJECT_ROOT))

from services.voice.app import config  # noqa: E402

COMMUNES = ["Abobo", "Adjamé", "Anyama", "Attécoubé", "Bingerville", "Cocody", "Koumassi", "Marcory", "Plateau",
            "Port-Bouët", "Songon", "Treichville", "Yopougon"]
CACHE = config.LOCAL_MODELS / "communes_abidjan.geojson"
USER_AGENT = "SIRA-dev/1.0 (+https://github.com/Guy277/SIRA_MVP)"


def download_boundaries() -> dict:
    features = []
    for name in COMMUNES:
        query = urllib.parse.urlencode({"q": f"{name}, Abidjan, Côte d'Ivoire", "format": "jsonv2",
                                        "polygon_geojson": 1, "limit": 5})
        request = urllib.request.Request(f"https://nominatim.openstreetmap.org/search?{query}",
                                         headers={"User-Agent": USER_AGENT})
        results = json.load(urllib.request.urlopen(request, timeout=60))
        shapes = [r for r in results if r.get("category") == "boundary"
                  and r["geojson"]["type"] in ("Polygon", "MultiPolygon")]
        if not shapes:
            sys.exit(f"Frontière introuvable pour {name}")
        features.append({"type": "Feature", "geometry": shapes[0]["geojson"],
                         "properties": {"commune": name, "osm_id": shapes[0]["osm_id"]}})
        print(f"  {name} : relation OSM {shapes[0]['osm_id']}")
        time.sleep(1.2)
    return {"type": "FeatureCollection", "features": features}


def boundaries() -> dict:
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    print("Téléchargement des frontières des communes (OpenStreetMap)…")
    data = download_boundaries()
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def in_ring(x: float, y: float, ring: list) -> bool:
    inside = False
    for (x1, y1), (x2, y2) in zip(ring[-1:] + ring[:-1], ring):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def in_shape(x: float, y: float, geometry: dict) -> bool:
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]
    return any(in_ring(x, y, poly[0]) and not any(in_ring(x, y, hole) for hole in poly[1:]) for poly in polygons)


NETWORK = PROJECT_ROOT / "data" / "processed" / "transport-network-unified.json"


def network_stops(known: set[str], shapes: list, existing=None) -> list[dict]:
    from services.voice.app.resolver import GENERIC_PENALTY

    """Arrêts nommés du réseau actuel (data/processed, extraction OSM) que le répertoire ne connaît pas encore.

    Position = centre des quais OSM qui portent ce nom. Un nom présent dans plusieurs communes donne un lieu par
    commune, « Nom (Commune) », comme les repères génériques du répertoire.
    Un nom presque identique (score ≥ 95) à un lieu déjà connu n'est pas ajouté : soit c'est le même arrêt écrit
    autrement (« Guiness » / « Guinness »), soit un homophone (« Carrefour Market » / « Carrefour Marché ») qui ferait
    hésiter la voix sur un lieu qu'elle trouvait bien. Il reste dans le réseau pour les trajets.
    """
    from services.voice.app.resolver import norm

    network = json.loads(NETWORK.read_text(encoding="utf-8"))
    if "OpenStreetMap" not in str(network.get("metadata", {}).get("license", "")):
        return []  # réseau de 2021 : ses arrêts sont déjà dans le répertoire du notebook
    groups: dict[tuple[str, str | None], list[dict]] = {}
    names: dict[str, set] = {}
    for stop in network["stops"]:
        if not stop.get("name") or stop.get("latitude") is None:
            continue
        key = norm(stop["name"])
        if len(key) < 3 or key in known:
            continue
        # Score sans la pénalité des repères génériques : « Carrefour Market » ressemble autant à
        # « Carrefour Marché (Abobo) » que si ce dernier n'était pas un nom vague.
        top = existing.resolve(stop["name"])[0] if existing is not None else None
        if top is not None and top.score + (GENERIC_PENALTY if top.kind == "landmark_generic" else 0) >= 95:
            known.add(key)  # écarté une fois pour toutes
            continue
        commune = next((f["properties"]["commune"] for f in shapes if in_shape(stop["longitude"], stop["latitude"], f["geometry"])), None)
        groups.setdefault((key, commune), []).append(stop)
        names.setdefault(key, set()).add(commune)
    places = []
    for (key, commune), stops in sorted(groups.items(), key=lambda item: (item[0][0], item[0][1] or "")):
        name = stops[0]["name"].strip()
        several = len(names[key]) > 1
        first = min(s["id"] for s in stops)
        places.append({
            "place_id": f"PL-S{first}" + (f"-{commune}" if several and commune else ""),
            "canonical": f"{name} ({commune})" if several and commune else name,
            "kind": "stop", "commune": commune,
            "lat": round(sum(s["latitude"] for s in stops) / len(stops), 6),
            "lon": round(sum(s["longitude"] for s in stops) / len(stops), 6),
            "aliases": [name.lower()],
            "source": f"OSM : centre de {len(stops)} quai(s) « {name} » du réseau ({', '.join(sorted(s['id'] for s in stops)[:3])}…)",
        })
    return places


def main() -> None:
    from services.voice.app.resolver import norm

    complements_path = config.LIEUX_COMPLEMENTS
    complements = json.loads(complements_path.read_text(encoding="utf-8"))
    places = json.loads(Path(config.GAZETTEER_PATH).read_text(encoding="utf-8"))
    shapes = boundaries()["features"]
    if NETWORK.exists():
        manual = places + complements.get("ajouts", [])
        known = {norm(x) for p in manual for x in [p["canonical"], *p.get("aliases", [])]}
        known |= {norm(x) for aliases in complements.get("alias", {}).values() for x in aliases}
        import tempfile

        from services.voice.app.resolver import PlaceResolver

        # Correcteur sans les arrêts du réseau : c'est par rapport aux lieux déjà connus qu'on écarte les quasi-doublons.
        manual_only = {k: v for k, v in complements.items() if k != "arrets_osm"}
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as handle:
            json.dump(manual_only, handle, ensure_ascii=False)
        try:
            existing = PlaceResolver(config.GAZETTEER_PATH, Path(handle.name))
        finally:
            Path(handle.name).unlink()
        complements["arrets_osm"] = network_stops(known, shapes, existing)
        print(f"Arrêts du réseau ajoutés à la voix : {len(complements['arrets_osm'])}")
    fixed = complements.get("coordonnees", {})
    for place in places:
        if place["place_id"] in fixed:
            place["lat"], place["lon"] = fixed[place["place_id"]]["lat"], fixed[place["place_id"]]["lon"]
    places += complements.get("ajouts", []) + complements.get("arrets_osm", [])

    communes, stats, moves = {}, Counter(), Counter()
    for place in places:
        if place.get("lat") is None or place.get("lon") is None:
            stats["sans coordonnées"] += 1
            continue
        found = next((f["properties"]["commune"] for f in shapes if in_shape(place["lon"], place["lat"], f["geometry"])), None)
        if found is None:
            stats["hors des 13 communes (commune gardée)"] += 1
            continue
        communes[place["place_id"]] = found
        if place.get("commune") == found:
            stats["commune confirmée"] += 1
        else:
            stats["commune corrigée"] += 1
            moves[(place.get("commune"), found)] += 1

    complements["communes"] = dict(sorted(communes.items()))
    complements_path.write_text(json.dumps(complements, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(places)} lieux : " + ", ".join(f"{label} {count}" for label, count in stats.most_common()))
    for (before, after), count in moves.most_common(8):
        print(f"  {count:4d} × {before} → {after}")
    print(f"Écrit : {complements_path.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
