import pilotCorridors from "@/data/pilot/corridors.json";

export type Coordinates = [number, number];
export type TravelMode = "walk" | "wait" | "transfer" | "gbaka" | "sotra" | "woro" | "taxi" | "boat";
export type DataStatus = "historical_open_data" | "estimated_mvp" | "live";

export type Place = {
  id: string;
  name: string;
  detail: string;
  coordinates: Coordinates;
};

export type TravelStep = {
  id: string;
  mode: TravelMode;
  label: string;
  detail: string;
  duration: number;
  price: number;
  geometry: Coordinates[];
  source?: string;
  dataStatus: DataStatus;
};

export type Journey = {
  id: "recommended" | "fast" | "cheap";
  label: string;
  description: string;
  duration: number;
  price: number;
  walking: number;
  comfort: number;
  reliability: number;
  color: string;
  badge?: string;
  recommended: boolean;
  reasons: string[];
  corridorId: string;
  corridorName: string;
  dataNotice: string;
  steps: TravelStep[];
  legs: TravelStep[];
  geometry: Coordinates[];
};

type PilotRoute = {
  id: string;
  sourceLineId: string;
  name: string;
  operator: string;
  network: string;
  distanceKm: number;
  coordinates: Coordinates[];
};

type SegmentConfig = {
  routeId: string;
  mode: Exclude<TravelMode, "walk" | "wait" | "transfer">;
  reverse?: boolean;
};

type OptionConfig = {
  id: Journey["id"];
  label: string;
  description: string;
  duration: number;
  price: number;
  walking: number;
  wait: number;
  transfer: number;
  comfort: number;
  reliability: number;
  color: string;
  segments: SegmentConfig[];
};

type CorridorConfig = {
  id: string;
  name: string;
  from: string;
  to: string;
  via: string[];
  options: OptionConfig[];
};

const pilot = pilotCorridors as unknown as {
  metadata: { notice: string; geometrySource: string };
  routes: Record<string, PilotRoute>;
};

export const ABIDJAN_CENTER: Coordinates = [-4.0083, 5.3484];

export const PLACES: Place[] = [
  { id: "yopougon", name: "Yopougon Kouté / Sideci", detail: "Yopougon, Abidjan · corridor pilote", coordinates: [-4.0736981, 5.3295751] },
  { id: "plateau-admin", name: "Plateau — Cité Administrative", detail: "Le Plateau, Abidjan · corridor pilote", coordinates: [-4.0238837, 5.3312414] },
  { id: "plateau", name: "Plateau — Gare Sud", detail: "Le Plateau, Abidjan · corridor pilote", coordinates: [-4.0197166, 5.3197413] },
  { id: "adjamé", name: "Adjamé Liberté", detail: "Adjamé, Abidjan · pôle de correspondance", coordinates: [-4.0162, 5.3534] },
  { id: "riviera-2", name: "Cocody / Riviera", detail: "Cocody, Abidjan · corridor pilote", coordinates: [-3.961682, 5.3596232] },
  { id: "bingerville", name: "Bingerville", detail: "Bingerville · corridor pilote", coordinates: [-3.889413, 5.3575965] },
  { id: "treichville", name: "Treichville — Gare de Bassam", detail: "Treichville, Abidjan · corridor pilote", coordinates: [-4.0024749, 5.299662] },
  { id: "abobo", name: "Abobo — Gare Mairie", detail: "Abobo, Abidjan · corridor pilote", coordinates: [-4.016225, 5.4085981] },
  { id: "cocody-danga", name: "Cocody Danga", detail: "Cocody, Abidjan", coordinates: [-3.9951, 5.3467] },
  { id: "marcory", name: "Marcory Résidentiel", detail: "Marcory, Abidjan", coordinates: [-3.9907, 5.2979] },
  { id: "aéroport", name: "Aéroport Félix Houphouët-Boigny", detail: "Port-Bouët, Abidjan", coordinates: [-3.9263, 5.2614] },
];

const CORRIDORS: CorridorConfig[] = [
  {
    id: "yopougon-adjame-plateau",
    name: "Yopougon → Adjamé → Plateau",
    from: "yopougon",
    to: "plateau-admin",
    via: ["Adjamé — Gare Nord"],
    options: [
      { id: "recommended", label: "Recommandé", description: "Bus SOTRA direct via Adjamé, meilleur compromis", duration: 54, price: 500, walking: 7, wait: 9, transfer: 0, comfort: 4, reliability: 84, color: "#f05a28", segments: [{ routeId: "yopougon_plateau_46", mode: "sotra" }] },
      { id: "fast", label: "Le plus rapide", description: "Taxi partagé sur le corridor principal", duration: 39, price: 1800, walking: 4, wait: 3, transfer: 0, comfort: 5, reliability: 82, color: "#2458d6", segments: [{ routeId: "yopougon_plateau_46", mode: "taxi" }] },
      { id: "cheap", label: "Le moins cher", description: "Deux bus collectifs avec correspondance à Adjamé", duration: 72, price: 400, walking: 10, wait: 18, transfer: 6, comfort: 2, reliability: 72, color: "#15966f", segments: [{ routeId: "yopougon_adjame_43", mode: "sotra" }, { routeId: "adjame_nord_plateau_46", mode: "sotra" }] },
    ],
  },
  {
    id: "plateau-adjame-riviera",
    name: "Plateau → Adjamé → Cocody / Riviera",
    from: "plateau",
    to: "riviera-2",
    via: ["Adjamé Liberté", "Cocody"],
    options: [
      { id: "recommended", label: "Recommandé", description: "SOTRA puis gbaka à Adjamé", duration: 58, price: 700, walking: 8, wait: 11, transfer: 7, comfort: 3, reliability: 81, color: "#f05a28", segments: [{ routeId: "plateau_adjame_91", mode: "sotra" }, { routeId: "adjame_riviera_gbaka", mode: "gbaka" }] },
      { id: "fast", label: "Le plus rapide", description: "Bus 28 direct vers Riviera", duration: 42, price: 500, walking: 5, wait: 7, transfer: 0, comfort: 4, reliability: 80, color: "#2458d6", segments: [{ routeId: "plateau_riviera_28", mode: "sotra" }] },
      { id: "cheap", label: "Le moins cher", description: "Collectif prioritaire, attente plus longue", duration: 69, price: 500, walking: 11, wait: 18, transfer: 8, comfort: 2, reliability: 70, color: "#15966f", segments: [{ routeId: "plateau_adjame_91", mode: "sotra" }, { routeId: "adjame_riviera_gbaka", mode: "gbaka" }] },
    ],
  },
  {
    id: "plateau-adjame-riviera-bingerville",
    name: "Plateau → Adjamé → Cocody / Riviera → Bingerville",
    from: "plateau",
    to: "bingerville",
    via: ["Adjamé Liberté", "Cocody / Riviera"],
    options: [
      { id: "recommended", label: "Recommandé", description: "Correspondance unique à Adjamé vers Bingerville", duration: 92, price: 1000, walking: 8, wait: 14, transfer: 7, comfort: 3, reliability: 79, color: "#f05a28", segments: [{ routeId: "plateau_adjame_91", mode: "sotra" }, { routeId: "adjame_bingerville_gbaka", mode: "gbaka" }] },
      { id: "fast", label: "Le plus rapide", description: "Bus 773 direct vers Bingerville", duration: 74, price: 700, walking: 6, wait: 9, transfer: 0, comfort: 4, reliability: 78, color: "#2458d6", segments: [{ routeId: "plateau_bingerville_773", mode: "sotra" }] },
      { id: "cheap", label: "Le moins cher", description: "SOTRA puis gbaka alternatif depuis Adjamé", duration: 108, price: 700, walking: 12, wait: 22, transfer: 9, comfort: 2, reliability: 67, color: "#15966f", segments: [{ routeId: "plateau_adjame_91", mode: "sotra" }, { routeId: "adjame_bingerville_gbaka_alt", mode: "gbaka" }] },
    ],
  },
  {
    id: "treichville-adjame-plateau",
    name: "Treichville → Adjamé → Plateau",
    from: "treichville",
    to: "plateau",
    via: ["Adjamé Liberté"],
    options: [
      { id: "recommended", label: "Recommandé", description: "Gbaka jusqu’à Adjamé puis SOTRA 91", duration: 64, price: 700, walking: 8, wait: 12, transfer: 7, comfort: 3, reliability: 78, color: "#f05a28", segments: [{ routeId: "treichville_adjame_gbaka", mode: "gbaka" }, { routeId: "plateau_adjame_91", mode: "sotra", reverse: true }] },
      { id: "fast", label: "Le plus rapide", description: "Bus 22 puis SOTRA 46 à Gare Nord", duration: 57, price: 500, walking: 7, wait: 10, transfer: 6, comfort: 4, reliability: 76, color: "#2458d6", segments: [{ routeId: "treichville_adjame_22", mode: "sotra" }, { routeId: "adjame_nord_plateau_46", mode: "sotra" }] },
      { id: "cheap", label: "Le moins cher", description: "Même axe collectif avec davantage d’attente", duration: 76, price: 500, walking: 11, wait: 20, transfer: 8, comfort: 2, reliability: 68, color: "#15966f", segments: [{ routeId: "treichville_adjame_gbaka", mode: "gbaka" }, { routeId: "plateau_adjame_91", mode: "sotra", reverse: true }] },
    ],
  },
  {
    id: "abobo-adjame-plateau",
    name: "Abobo → Adjamé → Plateau",
    from: "abobo",
    to: "plateau",
    via: ["Adjamé Liberté"],
    options: [
      { id: "recommended", label: "Recommandé", description: "Gbaka puis SOTRA, correspondance lisible à Adjamé", duration: 67, price: 700, walking: 8, wait: 13, transfer: 7, comfort: 3, reliability: 80, color: "#f05a28", segments: [{ routeId: "abobo_adjame_gbaka", mode: "gbaka" }, { routeId: "plateau_adjame_91", mode: "sotra", reverse: true }] },
      { id: "fast", label: "Le plus rapide", description: "Bus SOTRA 15 direct via Adjamé", duration: 53, price: 500, walking: 6, wait: 8, transfer: 0, comfort: 4, reliability: 82, color: "#2458d6", segments: [{ routeId: "abobo_plateau_15", mode: "sotra" }] },
      { id: "cheap", label: "Le moins cher", description: "Collectif avec attente plus longue à Adjamé", duration: 79, price: 500, walking: 11, wait: 21, transfer: 8, comfort: 2, reliability: 69, color: "#15966f", segments: [{ routeId: "abobo_adjame_gbaka", mode: "gbaka" }, { routeId: "plateau_adjame_91", mode: "sotra", reverse: true }] },
    ],
  },
];

export const PILOT_CORRIDORS = CORRIDORS.map(({ id, name, from, to, via }) => ({ id, name, from, to, via }));

const joinGeometry = (parts: Coordinates[][]): Coordinates[] => {
  const result: Coordinates[] = [];
  for (const coordinates of parts) {
    for (const coordinate of coordinates) {
      const previous = result[result.length - 1];
      if (!previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1]) result.push(coordinate);
    }
  }
  return result;
};

const transportLabel = (route: PilotRoute, mode: SegmentConfig["mode"]) => {
  if (mode === "taxi") return "Taxi partagé — axe routier principal";
  return route.name || (mode === "gbaka" ? "Gbaka" : "Bus SOTRA");
};

function buildOption(corridor: CorridorConfig, option: OptionConfig, budget: number): Journey {
  const resolved = option.segments.map((segment) => {
    const route = pilot.routes[segment.routeId];
    if (!route) throw new Error(`Segment pilote introuvable : ${segment.routeId}`);
    return { segment, route, coordinates: segment.reverse ? [...route.coordinates].reverse() : route.coordinates };
  });
  const totalDistance = resolved.reduce((sum, item) => sum + item.route.distanceKm, 0);
  const fixedMinutes = option.walking + option.wait + option.transfer;
  const ridingMinutes = Math.max(resolved.length, option.duration - fixedMinutes);
  const legs: TravelStep[] = [];
  const firstCoordinates = resolved[0].coordinates;
  const lastCoordinates = resolved[resolved.length - 1].coordinates;
  const accessPointCount = Math.max(2, Math.min(12, Math.floor(firstCoordinates.length * 0.04)));
  const egressPointCount = Math.max(2, Math.min(12, Math.floor(lastCoordinates.length * 0.035)));
  const accessDuration = Math.max(2, Math.round(option.walking * 0.6));
  const egressDuration = Math.max(1, option.walking - accessDuration);

  legs.push({ id: `${option.id}-access`, mode: "walk", label: "Rejoindre le point d’embarquement", detail: `${accessDuration} min de marche estimée`, duration: accessDuration, price: 0, geometry: firstCoordinates.slice(0, accessPointCount), dataStatus: "estimated_mvp" });

  resolved.forEach(({ segment, route, coordinates }, index) => {
    const segmentWait = Math.max(2, index === 0 ? Math.round(option.wait * 0.55) : option.wait - Math.round(option.wait * 0.55));
    const rideDuration = Math.max(2, Math.round(ridingMinutes * route.distanceKm / totalDistance));
    const segmentPrice = index === resolved.length - 1 ? option.price - legs.reduce((sum, leg) => sum + leg.price, 0) : Math.round(option.price * route.distanceKm / totalDistance / 100) * 100;
    const start = index === 0 ? accessPointCount - 1 : 0;
    const end = index === resolved.length - 1 ? coordinates.length - egressPointCount + 1 : coordinates.length;

    legs.push({ id: `${option.id}-wait-${index}`, mode: "wait", label: `Attente estimée — ${segment.mode === "gbaka" ? "gbaka" : segment.mode === "taxi" ? "taxi" : "bus"}`, detail: `${segmentWait} min · donnée MVP à valider`, duration: segmentWait, price: 0, geometry: [], dataStatus: "estimated_mvp" });
    legs.push({ id: `${option.id}-ride-${index}`, mode: segment.mode, label: transportLabel(route, segment.mode), detail: `${rideDuration} min · ${segmentPrice.toLocaleString("fr-FR")} FCFA`, duration: rideDuration, price: segmentPrice, geometry: coordinates.slice(start, end), source: `${route.operator} · ${route.network} · ${route.sourceLineId}`, dataStatus: "historical_open_data" });

    if (index < resolved.length - 1) {
      const nextStart = resolved[index + 1].coordinates[0];
      const currentEnd = coordinates[coordinates.length - 1];
      legs.push({ id: `${option.id}-transfer-${index}`, mode: "transfer", label: "Correspondance à Adjamé", detail: `${option.transfer} min estimées, attente comprise séparément`, duration: option.transfer, price: 0, geometry: [currentEnd, nextStart], dataStatus: "estimated_mvp" });
    }
  });

  legs.push({ id: `${option.id}-egress`, mode: "walk", label: "Terminer à pied jusqu’à destination", detail: `${egressDuration} min de marche estimée`, duration: egressDuration, price: 0, geometry: lastCoordinates.slice(-egressPointCount), dataStatus: "estimated_mvp" });
  const actualDuration = legs.reduce((sum, leg) => sum + leg.duration, 0);
  const durationDelta = option.duration - actualDuration;
  const longestRide = [...legs].filter((leg) => !["walk", "wait", "transfer"].includes(leg.mode)).sort((a, b) => b.duration - a.duration)[0];
  if (longestRide && durationDelta) longestRide.duration = Math.max(2, longestRide.duration + durationDelta);

  const withinBudget = option.price <= budget;
  const reasons = [
    withinBudget ? `Respecte le budget de ${budget.toLocaleString("fr-FR")} FCFA` : `Dépasse le budget de ${(option.price - budget).toLocaleString("fr-FR")} FCFA`,
    `${option.wait} min d’attente estimée`,
    `${resolved.length - 1} correspondance${resolved.length > 2 ? "s" : ""}`,
  ];

  return {
    id: option.id,
    label: option.label,
    description: option.description,
    duration: option.duration,
    price: option.price,
    walking: option.walking,
    comfort: option.comfort,
    reliability: option.reliability,
    color: option.color,
    badge: option.id === "recommended" ? "Choix SIRA" : option.id === "cheap" ? "Économique" : withinBudget ? "Dans votre budget" : undefined,
    recommended: option.id === "recommended",
    reasons,
    corridorId: corridor.id,
    corridorName: corridor.name,
    dataNotice: pilot.metadata.notice,
    steps: legs,
    legs,
    geometry: joinGeometry(legs.map((leg) => leg.geometry)),
  };
}

export function buildJourneys(from: Place, to: Place, budget = 1500): Journey[] {
  const corridor = CORRIDORS.find((candidate) => candidate.from === from.id && candidate.to === to.id);
  if (!corridor) return [];
  return corridor.options.map((option) => buildOption(corridor, option, budget));
}

export function isPilotCorridor(from: Place, to: Place) {
  return CORRIDORS.some((corridor) => corridor.from === from.id && corridor.to === to.id);
}

export const INITIAL_JOURNEYS = buildJourneys(PLACES[0], PLACES[1], 1000);

export const REPORTS = [
  { id: 1, type: "traffic", title: "Trafic dense", location: "Pont HKB", ago: "il y a 4 min", severity: "medium" },
  { id: 2, type: "road", title: "Voie dégagée", location: "Boulevard de France", ago: "il y a 7 min", severity: "low" },
  { id: 3, type: "incident", title: "Accident signalé", location: "Carrefour Indénié", ago: "il y a 12 min", severity: "high" },
];
