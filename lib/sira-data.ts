export type Coordinates = [number, number];

export type Place = {
  id: string;
  name: string;
  detail: string;
  coordinates: Coordinates;
};

export type TravelStep = {
  mode: "walk" | "gbaka" | "sotra" | "taxi" | "boat";
  label: string;
  detail: string;
  duration: number;
  price: number;
};

export type Journey = {
  id: string;
  label: string;
  description: string;
  duration: number;
  price: number;
  walking: number;
  comfort: number;
  reliability: number;
  color: string;
  badge?: string;
  steps: TravelStep[];
  geometry: Coordinates[];
};

export const ABIDJAN_CENTER: Coordinates = [-4.0083, 5.3484];

export const PLACES: Place[] = [
  { id: "cocody-danga", name: "Cocody Danga", detail: "Cocody, Abidjan", coordinates: [-3.9951, 5.3467] },
  { id: "plateau", name: "Plateau — Gare Sud", detail: "Le Plateau, Abidjan", coordinates: [-4.0201, 5.3196] },
  { id: "adjamé", name: "Gare d'Adjamé", detail: "Adjamé, Abidjan", coordinates: [-4.0162, 5.3534] },
  { id: "riviera-2", name: "Cocody Riviera 3", detail: "Cocody, Abidjan", coordinates: [-3.9617, 5.3597] },
  { id: "yopougon", name: "Siporex Yopougon", detail: "Yopougon, Abidjan", coordinates: [-4.0795, 5.3376] },
  { id: "treichville", name: "Gare de Treichville", detail: "Treichville, Abidjan", coordinates: [-4.0124, 5.2939] },
  { id: "marcory", name: "Marcory Résidentiel", detail: "Marcory, Abidjan", coordinates: [-3.9907, 5.2979] },
  { id: "aéroport", name: "Aéroport Félix Houphouët-Boigny", detail: "Port-Bouët, Abidjan", coordinates: [-3.9263, 5.2614] },
];

const curve = (from: Coordinates, to: Coordinates, bend: number): Coordinates[] => {
  const points: Coordinates[] = [];
  for (let i = 0; i <= 18; i += 1) {
    const t = i / 18;
    const wave = Math.sin(Math.PI * t) * bend;
    points.push([
      from[0] + (to[0] - from[0]) * t + wave,
      from[1] + (to[1] - from[1]) * t + wave * 0.42,
    ]);
  }
  return points;
};

export function buildJourneys(from: Place, to: Place, budget = 1500): Journey[] {
  const dx = (to.coordinates[0] - from.coordinates[0]) * 92;
  const dy = (to.coordinates[1] - from.coordinates[1]) * 111;
  const distance = Math.max(3.2, Math.sqrt(dx * dx + dy * dy));
  const trafficFactor = 1.14;
  const rapidPrice = Math.round(Math.max(900, distance * 235) / 100) * 100;
  const publicPrice = Math.round(Math.max(400, distance * 90) / 100) * 100;
  const mixedPrice = Math.round(Math.max(600, distance * 135) / 100) * 100;
  const budgetBadge = mixedPrice <= budget ? "Choix SIRA" : "Plus équilibré";

  return [
    {
      id: "recommended",
      label: "Recommandé",
      description: "Le meilleur équilibre aujourd’hui",
      duration: Math.round(distance * 4.8 * trafficFactor + 13),
      price: mixedPrice,
      walking: 7,
      comfort: 4,
      reliability: 91,
      color: "#ec5b2a",
      badge: budgetBadge,
      steps: [
        { mode: "walk", label: "Marchez jusqu’au carrefour", detail: "Environ 450 m", duration: 6, price: 0 },
        { mode: "sotra", label: "Bus SOTRA 81", detail: "Descendez à l’arrêt Commerce", duration: Math.round(distance * 3.6 + 6), price: Math.min(500, mixedPrice), },
        { mode: "taxi", label: "Taxi compteur partagé", detail: "Dernier kilomètre", duration: 6, price: Math.max(200, mixedPrice - 500) },
        { mode: "walk", label: "Arrivée à destination", detail: "Moins de 100 m", duration: 1, price: 0 },
      ],
      geometry: curve(from.coordinates, to.coordinates, 0.005),
    },
    {
      id: "fast",
      label: "Le plus rapide",
      description: "Moins de correspondances",
      duration: Math.round(distance * 3.5 * trafficFactor + 8),
      price: rapidPrice,
      walking: 3,
      comfort: 5,
      reliability: 84,
      color: "#2458d6",
      badge: rapidPrice <= budget ? "Dans votre budget" : undefined,
      steps: [
        { mode: "walk", label: "Rejoignez le point de prise en charge", detail: "Environ 180 m", duration: 3, price: 0 },
        { mode: "taxi", label: "Taxi compteur", detail: "Trajet direct, trafic modéré", duration: Math.round(distance * 3.4 + 5), price: rapidPrice },
      ],
      geometry: curve(from.coordinates, to.coordinates, -0.002),
    },
    {
      id: "cheap",
      label: "Le moins cher",
      description: "Transport collectif prioritaire",
      duration: Math.round(distance * 6.1 * trafficFactor + 17),
      price: publicPrice,
      walking: 13,
      comfort: 2,
      reliability: 77,
      color: "#15966f",
      badge: "Économisez",
      steps: [
        { mode: "walk", label: "Marchez vers le prochain arrêt", detail: "Environ 850 m", duration: 11, price: 0 },
        { mode: "gbaka", label: "Gbaka vers Adjamé", detail: "Signalez votre descente au carrefour", duration: Math.round(distance * 4.6 + 8), price: publicPrice },
        { mode: "walk", label: "Terminez à pied", detail: "Environ 150 m", duration: 2, price: 0 },
      ],
      geometry: curve(from.coordinates, to.coordinates, 0.010),
    },
  ];
}

export const INITIAL_JOURNEYS = buildJourneys(PLACES[0], PLACES[1], 1500);

export const REPORTS = [
  { id: 1, type: "traffic", title: "Trafic dense", location: "Pont HKB", ago: "il y a 4 min", severity: "medium" },
  { id: 2, type: "road", title: "Voie dégagée", location: "Boulevard de France", ago: "il y a 7 min", severity: "low" },
  { id: 3, type: "incident", title: "Accident signalé", location: "Carrefour Indénié", ago: "il y a 12 min", severity: "high" },
];
