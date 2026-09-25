export type Coordinates = [number, number];
export type TravelMode = "walk" | "wait" | "transfer" | "gbaka" | "sotra" | "woro" | "taxi" | "boat";
export type DataStatus = "historical_open_data" | "routed_osm" | "estimated_mvp" | "live";

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
  duration_p90?: number;
  price_p90?: number;
  estimate_method?: string;
  confidence?: number;
  guidance_available?: boolean;
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
  waiting?: number;
  transferCount?: number;
  durationP90?: number;
  score?: number;
  profileTags?: string[];
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

export const ABIDJAN_CENTER: Coordinates = [-4.0083, 5.3484];

// These places are only local search suggestions. Every coordinate pair is
// routed by the backend; none selects a predefined itinerary.
export const PLACES: Place[] = [
  { id: "yopougon", name: "Yopougon Kouté / Sideci", detail: "Yopougon, Grand Abidjan", coordinates: [-4.0736981, 5.3295751] },
  { id: "plateau-admin", name: "Plateau — Cité Administrative", detail: "Le Plateau, Grand Abidjan", coordinates: [-4.0238837, 5.3312414] },
  { id: "plateau", name: "Plateau — Gare Sud", detail: "Le Plateau, Grand Abidjan", coordinates: [-4.0197166, 5.3197413] },
  { id: "adjamé", name: "Adjamé Liberté", detail: "Adjamé, Grand Abidjan", coordinates: [-4.0162, 5.3534] },
  { id: "riviera-2", name: "Cocody / Riviera", detail: "Cocody, Grand Abidjan", coordinates: [-3.961682, 5.3596232] },
  { id: "bingerville", name: "Bingerville", detail: "Bingerville, Grand Abidjan", coordinates: [-3.889413, 5.3575965] },
  { id: "treichville", name: "Treichville — Gare de Bassam", detail: "Treichville, Grand Abidjan", coordinates: [-4.0024749, 5.299662] },
  { id: "abobo", name: "Abobo — Gare Mairie", detail: "Abobo, Grand Abidjan", coordinates: [-4.016225, 5.4085981] },
  { id: "cocody-danga", name: "Cocody Danga", detail: "Cocody, Grand Abidjan", coordinates: [-3.9951, 5.3467] },
  { id: "marcory", name: "Marcory Résidentiel", detail: "Marcory, Grand Abidjan", coordinates: [-3.9907, 5.2979] },
  { id: "aéroport", name: "Aéroport Félix Houphouët-Boigny", detail: "Port-Bouët, Grand Abidjan", coordinates: [-3.9263, 5.2614] },
];

export type ReportStatus = "reported" | "confirmed" | "reliable" | "expired" | "resolved";
export type TrafficReport = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  location: string;
  lat: number;
  lon: number;
  severity: "low" | "medium" | "high";
  status: ReportStatus;
  confirmations: number;
  contests: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};
export type ReportImpactItem = { report: TrafficReport; distanceM: number; delayMinutes: number; blocking: boolean; legIndex: number };
export type ReportImpact = { affected: ReportImpactItem[]; unconfirmed: ReportImpactItem[]; delayMinutes: number; blocking: boolean; requiresReroute: boolean };
