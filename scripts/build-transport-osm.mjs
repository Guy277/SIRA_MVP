// npm run data:osm [-- --fetch] : fabrique le réseau de transport d'Abidjan à partir d'OpenStreetMap d'aujourd'hui,
// dans les mêmes formats que les sources de 2021, pour que la suite (import, normalisation, API) ne change pas.
//
// Entrée : data/osm-2026/overpass-abidjan.json (export Overpass ; --fetch le retélécharge).
// Sorties dans data/osm-2026/ :
//   abidjan-osm.zip                 GTFS (lignes = route_master, sens = route, arrêts = membres « platform », sinon « stop »)
//   abidjantransport_lignes.csv     métadonnées par ligne (tarif, fréquence, horaires) pour import-transport-postgis
//   abidjantransport_lignes.geojson tracés par ligne (simplifiés à 10 m), propriétés comme data/raw/abidjantransport_lignes.geojson
//   comparaison-2021.json           lignes nouvelles, disparues, modifiées (lu par le rapport)
//
// Données : © contributeurs OpenStreetMap, ODbL. Méthodes (rien d'inventé) :
//   - tarif : balise OSM « charge » si présente, sinon tarif de 2021 de la même relation OSM, sinon inconnu ;
//   - horaires de passage : durée OSM « duration » si présente, sinon distance parcourue à 15 km/h (estimation) ;
//   - fréquence : balise OSM « interval », sinon celle de 2021 de la même relation, sinon aucune.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve();
const outDir = path.join(root, "data", "osm-2026");
const overpassPath = path.join(outDir, "overpass-abidjan.json");
// Réseau de 2021 (référence de comparaison et de reprise des tarifs) : sa sauvegarde une fois le réseau actualisé.
const network2021Path = [path.join(root, "data", "processed", "2021", "transport-network-unified.json"),
  path.join(root, "data", "processed", "transport-network-unified.json")].find((file) => fs.existsSync(file));
const BBOX = "5.18,-4.25,5.62,-3.70"; // Grand Abidjan (sud, ouest, nord, est)
const SPEED_KMH = 15; // vitesse commerciale retenue quand OSM ne donne pas de durée
const PLATFORM_ROLES = new Set(["platform", "platform_entry_only", "platform_exit_only"]);
const STOP_ROLES = new Set(["stop", "stop_entry_only", "stop_exit_only"]);

async function fetchOverpass() {
  const query = `[out:json][timeout:600];
rel["type"="route"]["route"~"^(bus|share_taxi|minibus|ferry)$"](${BBOX})->.r;
.r out body meta;
way(r.r); out geom;
node(r.r); out;
rel(br.r)["type"="route_master"]; out body meta;`;
  for (const url of ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]) {
    try {
      const response = await fetch(url, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        headers: { "User-Agent": "SIRA-dev/1.0 (+https://github.com/Guy277/SIRA_MVP)" },
      });
      if (response.ok) return response.json();
      console.warn(`[osm] ${url} : HTTP ${response.status}`);
    } catch (error) {
      console.warn(`[osm] ${url} : ${error.message}`);
    }
  }
  throw new Error("Overpass indisponible : réessaie plus tard.");
}

const distanceM = ([lon1, lat1], [lon2, lat2]) =>
  111_320 * Math.hypot(lat2 - lat1, (lon2 - lon1) * Math.cos((lat1 * Math.PI) / 180));
const csvCell = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csv = (header, rows) => [header.join(","), ...rows.map((row) => header.map((key) => csvCell(row[key])).join(","))].join("\n") + "\n";
const hms = (seconds) => {
  const s = Math.round(seconds);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
};
// Durée ou intervalle OSM en minutes : « 25 », « 00:05 » ou « 01:10:00 » (les deux formats sont courants à Abidjan).
const minutesOf = (value) => {
  const text = String(value ?? "").trim();
  const clock = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  const minutes = clock ? Number(clock[1]) * 60 + Number(clock[2]) + Number(clock[3] ?? 0) / 60 : text ? Number(text) : NaN;
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
};
const fareFromCharge = (charge) => {
  const match = String(charge ?? "").replace(/\s/g, "").match(/(\d+)/);
  return match ? Number(match[1]) : null;
};

// Simplification de Douglas-Peucker : garde les points qui s'écartent de plus de toleranceM de la ligne droite.
// OSM décrit chaque virage à quelques mètres près ; à 10 m, le tracé est le même à l'œil mais le graphe de l'API
// a 4 fois moins de nœuds (mesuré : 25 618 → 5 882), ce qui garde la recherche de trajet dans son budget.
function simplify(points, toleranceM = 10) {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const k = Math.cos((points[0][1] * Math.PI) / 180);
  const offset = (p, a, b) => {
    const [ax, ay, bx, by, px, py] = [a[0] * k, a[1], b[0] * k, b[1], p[0] * k, p[1]];
    const dx = bx - ax, dy = by - ay;
    const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy) * 111_320;
  };
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let best = 0, index = -1;
    for (let m = i + 1; m < j; m += 1) {
      const d = offset(points[m], points[i], points[j]);
      if (d > best) (best = d), (index = m);
    }
    if (best > toleranceM) {
      keep[index] = true;
      stack.push([i, index], [index, j]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// Met les voies d'un sens bout à bout dans l'ordre de la relation, en retournant celles qui sont à l'envers.
function chainWays(ways) {
  const line = [];
  for (const way of ways) {
    let points = way.geometry.map((p) => [p.lon, p.lat]);
    if (line.length) {
      const end = line[line.length - 1];
      const forward = distanceM(end, points[0]);
      const backward = distanceM(end, points[points.length - 1]);
      if (backward < forward) points = points.reverse();
      if (distanceM(end, points[0]) < 1) points = points.slice(1);
    } else if (ways.length > 1) {
      // Premier tronçon : le sens qui rejoint le suivant.
      const next = ways[1].geometry.map((p) => [p.lon, p.lat]);
      const ends = [next[0], next[next.length - 1]];
      const tail = Math.min(...ends.map((e) => distanceM(points[points.length - 1], e)));
      const head = Math.min(...ends.map((e) => distanceM(points[0], e)));
      if (head < tail) points = points.reverse();
    }
    line.push(...points);
  }
  return line;
}

function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(text, "utf8");
    const packed = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x0800, 8); entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(packed.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    parts.push(local, nameBytes, packed);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + packed.length;
  }
  const size = central.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  if (process.argv.includes("--fetch") || !fs.existsSync(overpassPath)) {
    console.log("[osm] Téléchargement des lignes depuis OpenStreetMap (Overpass)…");
    fs.writeFileSync(overpassPath, JSON.stringify(await fetchOverpass()));
  }
  const overpass = JSON.parse(fs.readFileSync(overpassPath, "utf8"));
  const osmDate = overpass.osm3s?.timestamp_osm_base ?? new Date().toISOString();
  const nodes = new Map(), ways = new Map(), routes = new Map(), masters = [];
  for (const el of overpass.elements) {
    if (el.type === "node") nodes.set(el.id, el);
    else if (el.type === "way") ways.set(el.id, el);
    else if (el.tags?.type === "route") routes.set(el.id, el);
    else if (el.tags?.type === "route_master") masters.push(el);
  }
  // Un sens sans fiche de ligne devient sa propre ligne.
  const inMaster = new Set(masters.flatMap((m) => m.members.filter((x) => x.type === "relation").map((x) => x.ref)));
  for (const route of routes.values()) {
    if (!inMaster.has(route.id)) masters.push({ id: route.id, tags: { ...route.tags, type: "route_master" }, members: [{ type: "relation", ref: route.id }], timestamp: route.timestamp });
  }

  const old = fs.existsSync(network2021Path) ? JSON.parse(fs.readFileSync(network2021Path, "utf8")) : { routes: [], trips: [], stop_times: [], frequencies: [] };
  const oldRoutes = new Map(old.routes.map((r) => [r.id, r]));
  const oldFrequency = new Map(old.frequencies.map((f) => [f.trip_id.split("_")[0], f]));

  const agencies = new Map(), stops = new Map(), gtfsRoutes = [], trips = [], stopTimes = [], shapes = [], frequencies = [], lines = [], features = [];
  const emittedRoutes = new Set();
  const stats = { sens_sans_arret: 0, durees_osm: 0, durees_estimees: 0, tarifs_osm: 0, tarifs_2021: 0, tarifs_inconnus: 0 };

  for (const master of masters) {
    const t = master.tags;
    // Un même sens peut être listé deux fois dans la fiche de ligne : on ne le garde qu'une fois.
    const members = [...new Set(master.members.filter((m) => m.type === "relation" && routes.has(m.ref)).map((m) => m.ref))].map((ref) => routes.get(ref));
    if (!members.length) continue;
    const routeId = `r${master.id}`;
    const network = t.network || members[0].tags.network || t.operator || "Inconnu";
    agencies.set(network, { agency_id: network, agency_name: network, agency_url: "https://www.openstreetmap.org", agency_timezone: "Africa/Abidjan", agency_lang: "fr" });
    const ferry = t.route_master === "ferry" || members.some((r) => r.tags.route === "ferry");
    const previous = oldRoutes.get(routeId);
    let fare = fareFromCharge(t.charge ?? members[0].tags.charge), fareSource = "osm";
    if (fare === null && previous?.fare_amount_fcfa != null) { fare = Number(previous.fare_amount_fcfa); fareSource = "2021"; }
    stats[fare === null ? "tarifs_inconnus" : fareSource === "osm" ? "tarifs_osm" : "tarifs_2021"] += 1;
    gtfsRoutes.push({ route_id: routeId, agency_id: network, route_short_name: t.ref ?? members[0].tags.ref ?? "", route_long_name: t.name ?? members[0].tags.name ?? "",
      route_type: ferry ? 4 : 3, route_color: (t.colour ?? members[0].tags.colour ?? "").replace("#", "") });

    const lineWays = new Map();
    members.forEach((route, index) => {
      // Un sens partagé par deux lignes OSM devient un sens par ligne : la seconde ajoute son identifiant.
      const suffix = emittedRoutes.has(route.id) ? `_${routeId}` : "";
      emittedRoutes.add(route.id);
      const tripId = `r${route.id}${suffix}_Mo-Su`;
      const shapeId = `r${route.id}${suffix}`;
      const routeWays = route.members.filter((m) => m.type === "way" && !PLATFORM_ROLES.has(m.role) && ways.has(m.ref)).map((m) => ways.get(m.ref));
      routeWays.forEach((w) => lineWays.set(w.id, w));
      const shape = chainWays(routeWays);
      shape.forEach(([lon, lat], i) => shapes.push({ shape_id: shapeId, shape_pt_lat: lat, shape_pt_lon: lon, shape_pt_sequence: i }));

      // Quais (platform) d'abord ; les arrêts (stop) quand il y a moins de deux quais (bateau-bus 503 : 1 quai, 2 arrêts).
      let platforms = route.members.filter((m) => PLATFORM_ROLES.has(m.role));
      const stopMembers = route.members.filter((m) => STOP_ROLES.has(m.role));
      if (platforms.length < 2 && stopMembers.length > platforms.length) platforms = stopMembers;
      const points = [];
      for (const m of platforms) {
        let lon, lat, name;
        if (m.type === "node" && nodes.has(m.ref)) ({ lon, lat } = nodes.get(m.ref)), (name = nodes.get(m.ref).tags?.name);
        else if (m.type === "way" && ways.has(m.ref)) {
          const g = ways.get(m.ref).geometry;
          lon = g.reduce((s, p) => s + p.lon, 0) / g.length; lat = g.reduce((s, p) => s + p.lat, 0) / g.length;
          name = ways.get(m.ref).tags?.name;
        } else continue;
        const stopId = `${m.type[0]}${m.ref}`;
        if (!stops.has(stopId)) stops.set(stopId, { stop_id: stopId, stop_name: name ?? "", stop_lat: lat, stop_lon: lon, location_type: 0 });
        points.push({ stopId, coord: [lon, lat] });
      }
      if (points.length < 2) { stats.sens_sans_arret += 1; return; }

      // Distance le long du trajet entre arrêts (à vol d'oiseau, faute de position exacte sur le tracé).
      const cumulative = [0];
      for (let i = 1; i < points.length; i += 1) cumulative.push(cumulative[i - 1] + distanceM(points[i - 1].coord, points[i].coord));
      const total = cumulative[cumulative.length - 1] || 1;
      const osmMinutes = minutesOf(route.tags.duration ?? t.duration);
      const seconds = osmMinutes ? osmMinutes * 60 : (total / 1000 / SPEED_KMH) * 3600;
      stats[osmMinutes ? "durees_osm" : "durees_estimees"] += 1;
      points.forEach((p, i) => {
        const time = hms(6 * 3600 + (seconds * cumulative[i]) / total);
        stopTimes.push({ trip_id: tripId, arrival_time: time, departure_time: time, stop_id: p.stopId, stop_sequence: i, timepoint: 0 });
      });
      trips.push({ route_id: routeId, service_id: "Mo-Su", trip_id: tripId, trip_headsign: route.tags.to ?? "", direction_id: index % 2, shape_id: shapeId });

      const interval = minutesOf(route.tags.interval ?? t.interval);
      const headway = interval ? Math.round(interval * 60) : Number(oldFrequency.get(`r${route.id}`)?.headway_secs);
      if (Number.isFinite(headway) && headway > 0) frequencies.push({ trip_id: tripId, start_time: "05:00:00", end_time: "22:00:00", headway_secs: headway });
    });

    const interval = t.interval ?? members[0].tags.interval ?? previous?.frequency_raw ?? "";
    lines.push({ route_id: routeId, code: t.ref ?? "", "osm:charge": fare === null ? "" : `${fare}FCFA`, fare_source: fare === null ? "" : fareSource,
      frequency: interval, opening_hours: t.opening_hours ?? members[0].tags.opening_hours ?? previous?.opening_hours ?? "",
      frequency_exceptions: t["interval:conditional"] ?? previous?.frequency_exceptions ?? "" });
    features.push({ type: "Feature",
      geometry: { type: "MultiLineString", coordinates: [...lineWays.values()].map((w) => simplify(w.geometry.map((p) => [p.lon, p.lat]))) },
      properties: { code: t.ref ?? null, line_id: `Line:relation:${master.id}`, operator: t.operator ?? members[0].tags.operator ?? null, network,
        frequency: interval || null, mode: ferry ? "ferry" : (members[0].tags.route ?? "bus"), name: t.name ?? members[0].tags.name ?? null,
        opening_hours: t.opening_hours ?? members[0].tags.opening_hours ?? previous?.opening_hours ?? null,
        frequency_exceptions: t["interval:conditional"] ?? previous?.frequency_exceptions ?? null, colour: t.colour ?? null } });
  }

  const day = osmDate.slice(0, 10).replaceAll("-", "");
  const files = {
    "agency.txt": csv(["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"], [...agencies.values()]),
    "stops.txt": csv(["stop_id", "stop_name", "stop_lat", "stop_lon", "location_type"], [...stops.values()]),
    "routes.txt": csv(["route_id", "agency_id", "route_short_name", "route_long_name", "route_type", "route_color"], gtfsRoutes),
    "trips.txt": csv(["route_id", "service_id", "trip_id", "trip_headsign", "direction_id", "shape_id"], trips),
    "stop_times.txt": csv(["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence", "timepoint"], stopTimes),
    "shapes.txt": csv(["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"], shapes),
    "frequencies.txt": csv(["trip_id", "start_time", "end_time", "headway_secs"], frequencies),
    "calendar.txt": csv(["service_id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "start_date", "end_date"],
      [{ service_id: "Mo-Su", monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 1, sunday: 1, start_date: day, end_date: `${Number(day.slice(0, 4)) + 1}${day.slice(4)}` }]),
    "feed_info.txt": csv(["feed_publisher_name", "feed_publisher_url", "feed_lang", "feed_version"],
      [{ feed_publisher_name: "SIRA (extraction OpenStreetMap, © contributeurs OSM, ODbL)", feed_publisher_url: "https://www.openstreetmap.org/copyright", feed_lang: "fr", feed_version: osmDate }]),
  };
  fs.writeFileSync(path.join(outDir, "abidjan-osm.zip"), zip(files));
  fs.writeFileSync(path.join(outDir, "abidjantransport_lignes.csv"), csv(["route_id", "code", "osm:charge", "fare_source", "frequency", "opening_hours", "frequency_exceptions"], lines));
  fs.writeFileSync(path.join(outDir, "abidjantransport_lignes.geojson"), JSON.stringify({ type: "FeatureCollection", features }));

  // Comparaison avec 2021, relation OSM par relation OSM.
  const newIds = new Set(gtfsRoutes.map((r) => r.route_id));
  const oldStops = new Map();
  for (const st of old.stop_times) {
    if (!oldStops.has(st.trip_id)) oldStops.set(st.trip_id, []);
    oldStops.get(st.trip_id).push([Number(st.stop_sequence), st.stop_id]);
  }
  const newStops = new Map();
  for (const st of stopTimes) {
    if (!newStops.has(st.trip_id)) newStops.set(st.trip_id, []);
    newStops.get(st.trip_id).push([st.stop_sequence, st.stop_id]);
  }
  const seq = (list) => (list ?? []).sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(">");
  const oldTripsByRoute = new Map();
  for (const trip of old.trips) {
    if (!oldTripsByRoute.has(trip.route_id)) oldTripsByRoute.set(trip.route_id, []);
    oldTripsByRoute.get(trip.route_id).push(trip.trip_id);
  }
  const changedStops = [], renamed = [];
  for (const route of gtfsRoutes) {
    const before = oldRoutes.get(route.route_id);
    if (!before) continue;
    if ((before.long_name ?? "") !== route.route_long_name) renamed.push({ id: route.route_id, avant: before.long_name, apres: route.route_long_name });
    const changed = (oldTripsByRoute.get(route.route_id) ?? []).some((tripId) => seq(oldStops.get(tripId)) !== seq(newStops.get(tripId)));
    if (changed) changedStops.push({ id: route.route_id, nom: route.route_long_name });
  }
  const comparison = {
    osm_date: osmDate,
    lignes_2021: old.routes.length, lignes_osm: gtfsRoutes.length,
    nouvelles: gtfsRoutes.filter((r) => !oldRoutes.has(r.route_id)).map((r) => ({ id: r.route_id, reseau: r.agency_id, nom: r.route_long_name })),
    disparues: old.routes.filter((r) => !newIds.has(r.id)).map((r) => ({ id: r.id, mode: r.mode, nom: r.long_name })),
    arrets_modifies: changedStops, renommees: renamed,
    arrets: { avant: old.stops?.length ?? 0, apres: stops.size }, stats,
    tarifs: { identiques: 0, ajoutes: 0, changes: [] },
  };
  const fareOf = new Map(lines.map((line) => [line.route_id, fareFromCharge(line["osm:charge"])]));
  for (const before of old.routes) {
    if (!fareOf.has(before.id)) continue;
    const now = fareOf.get(before.id), was = before.fare_amount_fcfa == null ? null : Number(before.fare_amount_fcfa);
    if (was === null && now !== null) comparison.tarifs.ajoutes += 1;
    else if (was === now) comparison.tarifs.identiques += 1;
    else comparison.tarifs.changes.push({ id: before.id, nom: before.long_name, avant: was, apres: now });
  }
  fs.writeFileSync(path.join(outDir, "comparaison-2021.json"), JSON.stringify(comparison, null, 2));
  writeReport(comparison);
  console.log(`[osm] OSM du ${osmDate} : ${gtfsRoutes.length} lignes, ${trips.length} sens, ${stops.size} arrêts`);
  console.log(`[osm] Par rapport à 2021 : ${comparison.nouvelles.length} nouvelles, ${comparison.disparues.length} disparues, ${changedStops.length} avec arrêts modifiés, ${renamed.length} renommées`);
  console.log("[osm]", JSON.stringify(stats));
}

// Rapport lisible (docs/transport-osm.md), réécrit à chaque extraction.
function writeReport(c) {
  const byNetwork = new Map();
  for (const line of c.nouvelles) {
    if (!byNetwork.has(line.reseau)) byNetwork.set(line.reseau, []);
    byNetwork.get(line.reseau).push(line.nom);
  }
  const s = c.stats;
  const lines = [
    "# Réseau de transport : extraction OpenStreetMap",
    "",
    `Généré par \`npm run data:osm\` (scripts/build-transport-osm.mjs) à partir d'OpenStreetMap du **${c.osm_date.slice(0, 10)}**.`,
    "Données © contributeurs OpenStreetMap, licence ODbL. Les lignes de transport informel ajoutées en 2022-2023 ont été",
    "relevées sur le terrain et saisies directement dans OSM (changesets #DataTransport #Ewarren, source « survey »).",
    "",
    "## Par rapport au réseau de 2021",
    "",
    "| | 2021 | Aujourd'hui |",
    "|---|---|---|",
    `| Lignes | ${c.lignes_2021} | **${c.lignes_osm}** |`,
    `| Arrêts | ${c.arrets.avant} | **${c.arrets.apres}** |`,
    "",
    `- **${c.nouvelles.length} lignes nouvelles**, **${c.disparues.length} disparues**, **${c.arrets_modifies.length}** dont la liste d'arrêts a changé.`,
    `- ${c.renommees.length} noms de ligne réécrits (surtout de la mise en forme : « Aéroport ↔ Gare Sud » → « bus 06 : Aéroport ↔ Gare Sud »).`,
    `- **Tarifs** : ${s.tarifs_osm} lignes avec un tarif OSM (balise \`charge\`), ${s.tarifs_2021} repris de 2021, ${s.tarifs_inconnus} inconnus.`,
    `  Lignes déjà présentes en 2021 : ${c.tarifs.identiques} tarifs identiques, ${c.tarifs.ajoutes} ajoutés (elles n'en avaient pas), ${c.tarifs.changes.length} changés.`,
    ...c.tarifs.changes.map((f) => `  - ${f.nom} : ${f.avant ?? "?"} F → ${f.apres ?? "?"} F`),
    `- **Horaires de passage** : durée OSM (\`duration\`) pour ${s.durees_osm} sens ; ${s.durees_estimees} estimés à 15 km/h sur la distance.`,
    `- ${s.sens_sans_arret} sens sans arrêts dans OSM sont ignorés.`,
    "",
    "## Méthodes (rien d'inventé)",
    "",
    "- Lignes = relations `route_master`, sens = relations `route`, arrêts = membres `platform` (`stop` s'il y a moins de 2 quais).",
    "- Durée (`duration`) et intervalle (`interval`) lus en minutes, `HH:MM` ou `HH:MM:SS`.",
    "- Tarif : `charge` OSM, sinon tarif de 2021 de la même relation, sinon inconnu.",
    "- Fréquence : `interval` OSM, sinon celle de 2021 de la même relation, sinon aucune.",
    "- Tracés pour le calcul de trajet simplifiés à 10 m (Douglas-Peucker) ; le GTFS garde les tracés complets.",
    "",
    "## Mettre SIRA à jour avec cette extraction",
    "",
    "Le réseau de 2021 se garde une fois dans `data/processed/2021/` (référence de comparaison). Puis, depuis la racine :",
    "",
    "```bash",
    "npm run data:osm",
    `node scripts/normalize-transport-data.mjs --input data/osm-2026/abidjantransport_lignes.geojson --source "OpenStreetMap (Overpass), lignes du Grand Abidjan" --date ${c.osm_date.slice(0, 10)} --license "ODbL (© contributeurs OpenStreetMap)"`,
    `node scripts/import-transport-postgis.mjs --gtfs data/osm-2026/abidjan-osm.zip --lines data/osm-2026/abidjantransport_lignes.csv --source-date ${c.osm_date.slice(0, 10)} --license "ODbL (© contributeurs OpenStreetMap)"`,
    "```",
    "",
    "Relire ensuite `services/voice/knowledge/reseau.md` (nombre de lignes, gares de bateau-bus).",
    "",
    "## Lignes disparues",
    "",
    ...c.disparues.map((l) => `- ${l.nom} (${l.mode}, relation ${l.id})`),
    "",
    "## Lignes nouvelles, par réseau",
    "",
    ...[...byNetwork.entries()].sort((a, b) => b[1].length - a[1].length).flatMap(([network, names]) => [
      `### ${network} (${names.length})`, "", ...names.sort().map((name) => `- ${name}`), ""]),
  ];
  fs.writeFileSync(path.join(root, "docs", "transport-osm.md"), lines.join("\n"));
}

main().catch((error) => {
  console.error(`[osm] ERREUR : ${error.message}`);
  process.exit(1);
});
