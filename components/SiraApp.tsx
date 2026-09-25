"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { io } from "socket.io-client";
import {
  ArrowLeft, ArrowRight, Bell, Bot, BusFront, Camera,
  Check, ChevronDown, CircleEllipsis, Clock3, CloudRain, Construction,
  Crosshair, Footprints, Heart, Home, LocateFixed, MapPin, Mic, Navigation,
  Route, Send, ShieldCheck, SlidersHorizontal, Sparkles, Star, ThumbsDown, ThumbsUp, TrafficCone, TriangleAlert, UserRound, Users,
  WalletCards, Waves, X,
} from "lucide-react";
import {
  PLACES, type Coordinates, type Journey, type Place, type ReportImpact,
  type TrafficReport, type TravelStep,
} from "@/lib/sira-data";

const SiraMap = dynamic(() => import("@/components/SiraMap"), { ssr: false });

type Screen = "home" | "results" | "detail" | "active" | "report";
type Preference = "balanced" | "fast" | "cheap" | "min_walking" | "min_transfers";
type SearchQuery = { origin: Place; destination: Place; budget: number | null; preference: Preference; maxWalking: number; excludedModes: string[]; departureTime: string | null };
type SearchOptions = Pick<SearchQuery, "budget" | "preference" | "maxWalking" | "excludedModes">;
type AvoidArea = { lat: number; lon: number; radiusM: number };
type ApiJourney = Partial<Pick<Journey, "id" | "duration" | "price" | "comfort" | "reliability">> & {
  id: string;
  label?: string;
  description?: string;
  walking_minutes?: number;
  shape?: string | null;
  geometry?: Coordinates[] | null;
  legs?: TravelStep[];
  reasons?: string[];
  data_notice?: string;
  recommended?: boolean;
  walking_distance_m?: number;
  waiting_minutes?: number;
  transfer_count?: number;
  duration_p90?: number;
  sira_score?: number;
  profile_tags?: string[];
};

type JourneysResponse = { journeys?: ApiJourney[]; recommended_id?: string | null; fastest_id?: string | null; cheapest_id?: string | null; rejected?: unknown[] };

const modeMeta: Record<TravelStep["mode"], { icon: typeof Footprints; label: string }> = {
  walk: { icon: Footprints, label: "Marche" },
  gbaka: { icon: BusFront, label: "Gbaka" },
  sotra: { icon: BusFront, label: "Bus" },
  taxi: { icon: Navigation, label: "Taxi" },
  boat: { icon: Waves, label: "Bateau-bus" },
  wait: { icon: Clock3, label: "Attente" },
  transfer: { icon: Route, label: "Correspondance" },
  woro: { icon: Navigation, label: "Wôrô-wôrô" },
};

const placeById = (id: string) => PLACES.find((place) => place.id === id) ?? PLACES[0];
const originDefault = placeById("yopougon");
const destinationDefault = placeById("plateau-admin");

function decodeValhallaShape(encoded: string): Coordinates[] {
  let index = 0;
  let lat = 0;
  let lon = 0;
  const coordinates: Coordinates[] = [];
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lon += result & 1 ? ~(result >> 1) : result >> 1;
    coordinates.push([lon / 1e6, lat / 1e6]);
  }
  return coordinates;
}

const preferenceLabels: Record<Preference, string> = {
  balanced: "Meilleur compromis",
  fast: "Le plus rapide",
  min_transfers: "Moins de correspondances",
  min_walking: "Moins de marche",
  cheap: "Le moins cher",
};
const MODE_OPTIONS = [
  { id: "sotra", label: "Bus SOTRA" }, { id: "gbaka", label: "Gbaka" }, { id: "woro", label: "Wôrô-wôrô" },
  { id: "boat", label: "Bateau-bus" }, { id: "taxi", label: "Taxi" },
];
const WALKING_OPTIONS = [600, 1000, 1500, 2500];
const DEFAULT_OPTIONS: SearchOptions = { budget: null, preference: "balanced", maxWalking: 1500, excludedModes: [] };

// "HH:MM" today, or now when no departure time was chosen.
function departureDate(time: string | null) {
  const date = new Date();
  if (time) { const [hours, minutes] = time.split(":").map(Number); date.setHours(hours, minutes, 0, 0); }
  return date;
}
const currentTime = () => new Date().toTimeString().slice(0, 5);
const reportStatusLabel: Record<TrafficReport["status"], string> = { reported: "Signalé · à confirmer", confirmed: "Confirmé", reliable: "Fiable", expired: "Expiré", resolved: "Résolu" };
const ACTIVE_REPORT_STATUSES: TrafficReport["status"][] = ["reported", "confirmed", "reliable"];
const VOTED_KEY = "sira-voted-reports";

// Browser storage is only a per-device convenience and may be unavailable.
const storage = {
  get(key: string) { try { return window.localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { window.localStorage.setItem(key, value); } catch { /* stockage indisponible */ } },
};

function readClientId() {
  const existing = storage.get("sira-client-id");
  if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  storage.set("sira-client-id", id);
  return id;
}

function readVotedIds(): string[] {
  try {
    const value: unknown = JSON.parse(storage.get(VOTED_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

function apiBaseUrl() {
  const localFrontend = ["3000", "3001", "5173"].includes(window.location.port);
  const localApiUrl = `${window.location.protocol}//${window.location.hostname}:4000/api/v1`;
  return (process.env.NEXT_PUBLIC_API_URL ?? (localFrontend ? localApiUrl : "/api/v1")).replace(/\/$/, "");
}

function socketOrigin() {
  const base = apiBaseUrl();
  return /^https?:\/\//.test(base) ? new URL(base).origin : window.location.origin;
}

async function apiJson<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 15_000, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, { ...rest, headers: { "content-type": "application/json", ...rest.headers }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") throw new Error("Le serveur SIRA met trop de temps à répondre. Réessayez dans un instant.");
    throw new Error("API SIRA inaccessible. Vérifiez que la stack complète est toujours ouverte sur le PC.");
  }
  if (!response.ok) {
    let message = `La requête SIRA a échoué (${response.status}).`;
    try {
      const errorPayload = await response.json() as { message?: string | string[] };
      if (Array.isArray(errorPayload.message)) message = errorPayload.message.join(" ");
      else if (errorPayload.message) message = errorPayload.message;
    } catch { /* réponse non JSON */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function toJourneys(data: JourneysResponse): Journey[] {
  return (data.journeys ?? []).flatMap((apiJourney) => {
    const geometry = apiJourney.geometry?.length ? apiJourney.geometry : apiJourney.shape ? decodeValhallaShape(apiJourney.shape) : [];
    const legs = apiJourney.legs ?? [];
    if (!geometry.length || !legs.length) return [];
    const tags = [...(apiJourney.id === data.fastest_id ? ["fastest"] : []), ...(apiJourney.id === data.cheapest_id ? ["cheapest"] : [])];
    const recommended = apiJourney.id === data.recommended_id || apiJourney.recommended === true;
    // Internal candidate labels ("Option fast") are not meant for users.
    const fallbackLabel = !apiJourney.label || apiJourney.label.startsWith("Option ") ? "Alternative SIRA" : apiJourney.label;
    const label = recommended ? "Recommandé par SIRA" : tags.includes("fastest") ? "Le plus rapide" : tags.includes("cheapest") ? "Le moins cher" : fallbackLabel;
    return [{
      id: apiJourney.id,
      label,
      description: apiJourney.description ?? "Calcul multimodal sur le réseau du Grand Abidjan",
      duration: apiJourney.duration ?? 0,
      durationP90: apiJourney.duration_p90,
      price: apiJourney.price ?? 0,
      walking: apiJourney.walking_minutes ?? 0,
      waiting: apiJourney.waiting_minutes ?? 0,
      transferCount: apiJourney.transfer_count ?? 0,
      comfort: apiJourney.comfort ?? 3,
      reliability: apiJourney.reliability ?? 65,
      score: apiJourney.sira_score,
      profileTags: tags,
      color: recommended ? "#f05a28" : tags.includes("fastest") ? "#2458d6" : "#15966f",
      badge: recommended ? "Choix SIRA" : undefined,
      reasons: apiJourney.reasons ?? [],
      corridorId: "grand-abidjan",
      corridorName: "Réseau du Grand Abidjan",
      steps: legs,
      legs,
      geometry,
      dataNotice: apiJourney.data_notice ?? "Tracés historiques data.gouv.ci ; temps, attente et prix estimés en Phase 1.",
      recommended,
    }];
  });
}

async function fetchJourneys(query: SearchQuery, avoid: AvoidArea[] = []) {
  const data = await apiJson<JourneysResponse>("/mobility/journeys", {
    method: "POST",
    timeoutMs: 30_000,
    body: JSON.stringify({
      origin: { lat: query.origin.coordinates[1], lon: query.origin.coordinates[0], name: query.origin.name },
      destination: { lat: query.destination.coordinates[1], lon: query.destination.coordinates[0], name: query.destination.name },
      ...(query.budget !== null ? { budget: query.budget } : {}),
      preference: query.preference,
      constraints: { maxWalkingDistanceM: query.maxWalking, maxTransfers: 3, excludedModes: query.excludedModes },
      ...(query.departureTime ? { departureAt: departureDate(query.departureTime).toISOString() } : {}),
      ...(avoid.length ? { avoid } : {}),
    }),
  });
  return { journeys: toJourneys(data), rejectedCount: data.rejected?.length ?? 0 };
}

const distanceM = ([lonA, latA]: Coordinates, [lonB, latB]: Coordinates) => {
  const radians = (value: number) => value * Math.PI / 180;
  const h = Math.sin(radians(latB - latA) / 2) ** 2 + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(radians(lonB - lonA) / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// Labels the reporter's position locally so no coordinates leave the device
// before the user actually sends the report.
function nearestPlaceLabel(coordinates: Coordinates) {
  const nearest = PLACES.map((place) => ({ place, distance: distanceM(coordinates, place.coordinates) })).sort((a, b) => a.distance - b.distance)[0];
  return nearest && nearest.distance < 3000 ? `Près de ${nearest.place.name}` : `${coordinates[1].toFixed(4)}, ${coordinates[0].toFixed(4)}`;
}

function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  return `il y a ${Math.round(minutes / 60)} h`;
}

const formatDistance = (meters: number) => meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1).replace(".", ",")} km`;

async function photonSearch(query: string): Promise<Place[]> {
  if (query.trim().length < 3) return [];
  try {
    const params = new URLSearchParams({
      q: `${query}, Abidjan, Côte d'Ivoire`, limit: "5", lang: "fr",
      lon: "-4.0083", lat: "5.3484",
    });
    const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`);
    if (!response.ok) throw new Error("search unavailable");
    const payload = await response.json();
    return (payload.features ?? []).map((feature: {
      geometry: { coordinates: [number, number] };
      properties: Record<string, string>;
    }, index: number) => ({
      id: `photon-${index}-${feature.geometry.coordinates.join("-")}`,
      name: feature.properties.name || feature.properties.street || query,
      detail: [feature.properties.district, feature.properties.city, feature.properties.state].filter(Boolean).join(", ") || "Abidjan",
      coordinates: feature.geometry.coordinates,
    }));
  } catch {
    return PLACES.filter((place) => `${place.name} ${place.detail}`.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
  }
}

function PlaceField({ value, placeholder, origin, onSelect, onLocate }: {
  value: Place;
  placeholder: string;
  origin?: boolean;
  onSelect: (place: Place) => void;
  onLocate?: () => void;
}) {
  const [query, setQuery] = useState(value.name);
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (!open || query === value.name || query.trim().length < 2) return;
      setLoading(true);
      setSuggestions(await photonSearch(query));
      setLoading(false);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, open, value.name]);

  const choose = (place: Place) => {
    setQuery(place.name);
    onSelect(place);
    setOpen(false);
  };

  return (
    <div className="place-field-wrap">
      <div className="place-field">
        {origin ? <Crosshair size={22} /> : <MapPin size={22} />}
        <input aria-label={placeholder} value={query} placeholder={placeholder} autoComplete="off" onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => event.key === "Escape" && setOpen(false)} />
        {onLocate && <button type="button" onClick={onLocate} aria-label="Utiliser ma position"><LocateFixed size={21} /></button>}
      </div>
      {open && query.length >= 2 && (
        <div className="place-suggestions">
          {loading && <p>Recherche en cours…</p>}
          {!loading && (suggestions.length ? suggestions : PLACES.slice(0, 5)).map((place) => (
            <button type="button" key={place.id} onClick={() => choose(place)}><MapPin size={16} /><span><strong>{place.name}</strong><small>{place.detail}</small></span></button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModeIcon({ mode, size = 20 }: { mode: TravelStep["mode"]; size?: number }) {
  const Icon = modeMeta[mode].icon;
  return <Icon size={size} />;
}

function ScreenHeader({ title, onBack, bell }: { title: string; onBack?: () => void; bell?: () => void }) {
  return <header className="screen-header">{onBack ? <button type="button" onClick={onBack} aria-label="Retour"><ArrowLeft size={24} /></button> : <span />}<h1>{title}</h1>{bell ? <button type="button" onClick={bell} aria-label="Notifications"><Bell size={22} /></button> : <span />}</header>;
}

function BottomNav({ screen, onChange, notify }: { screen: Screen; onChange: (screen: Screen) => void; notify: (message: string) => void }) {
  const items = [
    { label: "Accueil", icon: Home, active: screen === "home", action: () => onChange("home") },
    { label: "Trajets", icon: Route, active: ["results", "detail", "active"].includes(screen), action: () => onChange("results") },
    { label: "Signalements", icon: TriangleAlert, active: screen === "report", action: () => onChange("report") },
    { label: "Favoris", icon: Heart, active: false, action: () => notify("Aucun trajet favori pour le moment.") },
    { label: "Profil", icon: UserRound, active: false, action: () => notify("Les comptes utilisateurs arrivent dans une prochaine version.") },
  ];
  return <nav className="bottom-nav" aria-label="Navigation principale">{items.map(({ label, icon: Icon, active, action }) => <button type="button" key={label} className={active ? "active" : ""} onClick={action}><Icon size={22} strokeWidth={1.9} /><small>{label}</small></button>)}</nav>;
}

function Splash() {
  return <section className="splash-screen" aria-label="Chargement de SIRA"><div className="splash-brand"><strong>SIRA</strong><span>On trace sans stress</span></div><div className="city-line" aria-hidden="true"><span /><span /><span /><span /><span /></div><div className="splash-loader"><span className="splash-bus"><BusFront size={27} /></span><p>Chargement de votre trajet…</p><i><b /></i></div></section>;
}

function HomeScreen({ origin, destination, departureTime, activeOptions, reports, onOrigin, onDestination, onDepartureTime, onOptions, onLocate, onSearch, calculating, searchStatus, onAssistant }: {
  origin: Place; destination: Place; departureTime: string | null; activeOptions: number; reports: TrafficReport[]; onOrigin: (place: Place) => void; onDestination: (place: Place) => void; onDepartureTime: (value: string | null) => void; onOptions: () => void; onLocate: () => void; onSearch: () => void; calculating: boolean; searchStatus: string | null; onAssistant: () => void;
}) {
  return <section className="app-screen home-screen"><header className="home-brand"><strong>SIRA</strong><span>On trace sans stress</span><em>Réseau Grand Abidjan</em></header><div className="home-card"><h1>Où voulez-vous aller&nbsp;?</h1><div className="route-fields"><PlaceField key={origin.id} value={origin} placeholder="Ma position" origin onSelect={onOrigin} onLocate={onLocate} /><PlaceField key={destination.id} value={destination} placeholder="Destination" onSelect={onDestination} /></div><div className="search-options"><label className="departure-field"><Clock3 size={16} /><select aria-label="Heure de départ" value={departureTime === null ? "now" : "at"} onChange={(event) => onDepartureTime(event.target.value === "now" ? null : currentTime())}><option value="now">Partir maintenant</option><option value="at">Partir à…</option></select>{departureTime !== null && <input type="time" aria-label="Heure de départ choisie" value={departureTime} onChange={(event) => onDepartureTime(event.target.value || null)} />}</label><button type="button" className="options-button" onClick={onOptions} aria-label={`Options de recherche${activeOptions ? ` (${activeOptions} active${activeOptions > 1 ? "s" : ""})` : ""}`}><SlidersHorizontal size={16} />Options{activeOptions > 0 && <b>{activeOptions}</b>}</button></div></div><div className="home-map"><SiraMap origin={origin} destination={destination} journeys={[]} selectedJourneyId="" reports={reports} /><div className="map-place-label">Grand Abidjan</div><button type="button" className="assistant-map-button" onClick={onAssistant} aria-label="Ouvrir l'assistant SIRA"><Bot size={20} /></button></div><div className="home-action-wrap">{searchStatus && <p className={`search-status ${calculating ? "loading" : "error"}`}>{searchStatus}</p>}<button className="primary-button" type="button" onClick={onSearch} disabled={calculating}>{calculating ? "Calcul SIRA-MORE…" : "Rechercher un trajet"}<ArrowRight size={22} /></button></div></section>;
}

function OptionsSheet({ options, onChange, onClose }: { options: SearchOptions; onChange: (options: SearchOptions) => void; onClose: () => void }) {
  const set = (patch: Partial<SearchOptions>) => onChange({ ...options, ...patch });
  const enabledModes = MODE_OPTIONS.filter((mode) => !options.excludedModes.includes(mode.id)).length;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="options-sheet" role="dialog" aria-modal="true" aria-label="Options de recherche"><header><h2>Options</h2><button type="button" onClick={onClose} aria-label="Fermer"><X size={18} /></button></header><h3>Profil</h3><div className="chip-group">{(Object.keys(preferenceLabels) as Preference[]).map((value) => <button type="button" key={value} className={`chip ${options.preference === value ? "selected" : ""}`} aria-pressed={options.preference === value} onClick={() => set({ preference: value })}>{preferenceLabels[value]}</button>)}</div><h3>Modes de transport</h3><div className="chip-group">{MODE_OPTIONS.map((mode) => { const enabled = !options.excludedModes.includes(mode.id); return <button type="button" key={mode.id} className={`chip ${enabled ? "selected" : ""}`} aria-pressed={enabled} disabled={enabled && enabledModes === 1} onClick={() => set({ excludedModes: enabled ? [...options.excludedModes, mode.id] : options.excludedModes.filter((item) => item !== mode.id) })}>{enabled && <Check size={13} />}{mode.label}</button>; })}</div><h3>Marche maximale</h3><div className="chip-group">{WALKING_OPTIONS.map((value) => <button type="button" key={value} className={`chip ${options.maxWalking === value ? "selected" : ""}`} aria-pressed={options.maxWalking === value} onClick={() => set({ maxWalking: value })}>{value < 1000 ? `${value} m` : `${(value / 1000).toLocaleString("fr-FR")} km`}</button>)}</div><h3>Budget maximum <small>(optionnel)</small></h3><div className="budget-input"><WalletCards size={17} /><input type="number" min="0" step="100" inputMode="numeric" placeholder="Sans limite" aria-label="Budget maximum en FCFA" value={options.budget ?? ""} onChange={(event) => set({ budget: event.target.value === "" ? null : Math.max(0, Math.round(Number(event.target.value))) })} /><span>FCFA</span>{options.budget !== null && <button type="button" onClick={() => set({ budget: null })} aria-label="Retirer le budget"><X size={14} /></button>}</div><p className="options-hint">Sans budget, SIRA compare toutes les options et affiche le coût estimé de chacune.</p><footer><button type="button" onClick={() => onChange(DEFAULT_OPTIONS)}>Réinitialiser</button><button type="button" onClick={onClose}>Appliquer</button></footer></section></div>;
}

function ResultCard({ journey, selected, onSelect }: { journey: Journey; selected: boolean; onSelect: () => void }) {
  const modes = journey.steps.filter((step, index, all) => all.findIndex((item) => item.mode === step.mode) === index).slice(0, 4);
  return <article className={`result-card ${selected ? "recommended" : ""}`}><div className="result-icon">{journey.profileTags?.includes("fastest") ? <Clock3 /> : journey.profileTags?.includes("cheapest") ? <WalletCards /> : <Star />}</div><div className="result-copy"><span className="result-label">{journey.label}</span><small className="result-description">{journey.description}</small><div className="result-numbers"><strong>{journey.duration} <small>min</small></strong><strong>{journey.price.toLocaleString("fr-FR")} <small>FCFA</small></strong></div>{selected && <><p className="journey-metrics">P90 {journey.durationP90 ?? journey.duration} min · {journey.waiting ?? 0} min d’attente · {journey.transferCount ?? 0} correspondance(s)</p><div className="mode-strip">{modes.map((step, index) => <span key={`${step.mode}-${index}`}><ModeIcon mode={step.mode} /><small>{modeMeta[step.mode].label}<b>{step.duration} min</b></small>{index < modes.length - 1 && <ArrowRight size={14} />}</span>)}</div><div className="recommendation-reasons">{journey.reasons.map((reason) => <span key={reason}><Check size={12} />{reason}</span>)}</div><button type="button" className="inline-primary" onClick={onSelect}>Voir le trajet<ArrowRight size={20} /></button></>}</div>{!selected && <button className="card-hit" aria-label={`Choisir ${journey.label}`} type="button" onClick={onSelect} />}</article>;
}

function ResultsScreen({ query, journeys, reports, selectedId, onSelect, onBack }: {
  query: SearchQuery; journeys: Journey[]; reports: TrafficReport[]; selectedId: string; onSelect: (journey: Journey) => void; onBack: () => void;
}) {
  const ordered = [...journeys].sort((a, b) => a.recommended ? -1 : b.recommended ? 1 : a.duration - b.duration);
  return <section className="app-screen content-screen"><ScreenHeader title="Trajets proposés" onBack={onBack} /><div className="route-summary"><span><Crosshair /><b>Départ</b><em>{query.origin.name}</em></span><span><MapPin /><b>Destination</b><em>{query.destination.name}</em></span><span><Clock3 /><b>Heure</b><em>{query.departureTime ? `Départ à ${query.departureTime}` : "Maintenant"}</em></span><span><Star /><b>Profil</b><em>{preferenceLabels[query.preference]}</em></span>{query.budget !== null && <span><WalletCards /><b>Budget max</b><em>{query.budget.toLocaleString("fr-FR")} FCFA</em></span>}</div><div className="results-map"><SiraMap origin={query.origin} destination={query.destination} journeys={journeys} selectedJourneyId={selectedId} reports={reports} /></div><p className="data-banner"><Route size={15} />SIRA-MORE · contraintes → Pareto → diversité → score explicable · 325 lignes Grand Abidjan</p><div className="results-list">{ordered.map((journey) => <ResultCard key={journey.id} journey={journey} selected={journey.id === selectedId} onSelect={() => onSelect(journey)} />)}</div></section>;
}

function DetailScreen({ journey, destination, departureAt, onBack, onStart }: { journey: Journey; destination: Place; departureAt: Date; onBack: () => void; onStart: () => void }) {
  const departure = new Date(departureAt);
  departure.setSeconds(0, 0);
  const times = journey.legs.map((_, index) => {
    const elapsed = journey.legs.slice(0, index).reduce((sum, leg) => sum + leg.duration, 0);
    const time = new Date(departure.getTime() + elapsed * 60_000);
    return time.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  });
  const arrival = new Date(departure.getTime() + journey.duration * 60_000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const statusLabel = (step: TravelStep) => step.dataStatus === "historical_open_data" ? "Tracé open data 2021" : step.dataStatus === "routed_osm" ? "Chemin piéton OSM" : step.dataStatus === "live" ? "Temps réel" : "Estimation MVP";
  return <section className="app-screen content-screen detail-screen"><ScreenHeader title="Détail du trajet" onBack={onBack} /><div className="detail-summary"><p><Star size={16} fill="currentColor" /> {journey.label} · {journey.corridorName}</p><div><span><strong>{journey.duration}</strong> min<small>Durée totale estimée</small></span><i /><span><strong>{journey.price.toLocaleString("fr-FR")}</strong> FCFA<small>Coût total estimé</small></span></div></div><div className="timeline">{journey.legs.map((step, index) => <div className="timeline-row" key={step.id}><time>{times[index]}</time><span className={`timeline-icon ${!["walk", "wait", "transfer"].includes(step.mode) ? "active" : ""}`}><ModeIcon mode={step.mode} size={19} /></span><span className="timeline-copy"><strong>{step.label}</strong><small>{step.detail}</small><em className={`source-tag source-tag--${step.dataStatus}`}>{statusLabel(step)}{typeof step.confidence === "number" ? ` · confiance ${Math.round(step.confidence * 100)} %` : ""}</em></span></div>)}<div className="timeline-row"><time>{arrival}</time><span className="timeline-icon active"><Navigation size={19} fill="currentColor" /></span><span className="timeline-copy"><strong>Arrivée à destination</strong><small>{destination.name}</small></span></div></div><p className="method-note">{journey.dataNotice}</p><div className="sticky-action"><button type="button" className="primary-button" onClick={onStart}>Démarrer le trajet<ArrowRight size={22} /></button></div></section>;
}

function ActiveScreen({ origin, destination, journey, reports, budget, onBack, onReport, onReroute, onAdopt, notify }: {
  origin: Place; destination: Place; journey: Journey; reports: TrafficReport[]; budget: number | null; onBack: () => void; onReport: () => void;
  onReroute: (avoid: AvoidArea[]) => Promise<Journey | null>; onAdopt: (journey: Journey) => void; notify: (message: string) => void;
}) {
  const [impact, setImpact] = useState<ReportImpact | null>(null);
  const [impactUnavailable, setImpactUnavailable] = useState(false);
  const [alternative, setAlternative] = useState<{ forJourney: string; journey: Journey } | null>(null);
  const [rerouting, setRerouting] = useState(false);
  const [rerouteMessage, setRerouteMessage] = useState<{ forJourney: string; text: string } | null>(null);
  const [keptImpactKey, setKeptImpactKey] = useState("");
  const reportsKey = reports.map((report) => `${report.id}:${report.status}`).join("|");

  useEffect(() => {
    let cancelled = false;
    apiJson<ReportImpact>("/reports/impact", { method: "POST", body: JSON.stringify({ legs: journey.legs.map((leg) => ({ mode: leg.mode, geometry: leg.geometry })) }) })
      .then((value) => { if (!cancelled) { setImpact(value); setImpactUnavailable(false); } })
      .catch(() => { if (!cancelled) setImpactUnavailable(true); });
    return () => { cancelled = true; };
  }, [journey, reportsKey]);

  const nextLeg = journey.legs.find((leg) => !["walk", "wait", "transfer"].includes(leg.mode)) ?? journey.legs[0];
  const transfers = journey.legs.filter((leg) => leg.mode === "transfer").length;
  const affected = impact?.affected ?? [];
  const impactKey = affected.map((item) => item.report.id).join("|");
  const kept = affected.length > 0 && keptImpactKey === impactKey;
  const delay = impact?.delayMinutes ?? 0;
  const currentAlternative = alternative?.forJourney === journey.id ? alternative.journey : null;
  const currentMessage = rerouteMessage?.forJourney === journey.id ? rerouteMessage.text : null;

  const findAlternative = async () => {
    setRerouting(true); setRerouteMessage(null);
    const avoid = affected.map(({ report, blocking }) => ({ lat: report.lat, lon: report.lon, radiusM: blocking ? 300 : 200 }));
    try {
      const next = await onReroute(avoid);
      if (next) setAlternative({ forJourney: journey.id, journey: next });
      else setRerouteMessage({ forJourney: journey.id, text: "Aucune alternative ne contourne l’incident avec vos contraintes. Votre trajet actuel reste le meilleur choix." });
    } catch (error) {
      setRerouteMessage({ forJourney: journey.id, text: error instanceof Error ? error.message : "Recalcul impossible pour le moment." });
    } finally { setRerouting(false); }
  };

  const summary = affected.length
    ? `${affected.length} incident(s) confirmé(s) sur votre trajet, retard estimé +${delay} min.`
    : impact?.unconfirmed.length ? `${impact.unconfirmed.length} signalement(s) en attente de confirmation sur votre trajet.` : "Aucun incident confirmé sur votre trajet.";

  let incident;
  if (affected.length && !kept) {
    const first = affected[0];
    const people = first.report.confirmations > 1 ? `Confirmé par ${first.report.confirmations} usagers` : "Confirmé par un usager";
    incident = <article className="incident-card"><span><TriangleAlert size={25} /></span><p><strong>{first.report.title} signalé sur votre trajet{affected.length > 1 ? ` (+${affected.length - 1} autre${affected.length > 2 ? "s" : ""})` : ""}</strong><small><Users size={14} /> {people} · {first.report.location} · {timeAgo(first.report.createdAt)}</small><b>{impact?.blocking ? "Passage possiblement impraticable" : `Votre trajet risque d’être retardé de ${delay} min`} (estimation)</b></p></article>;
  } else if (affected.length && kept) {
    incident = <article className="incident-card incident-card--pending"><span><TriangleAlert size={25} /></span><p><strong>Vous gardez ce trajet malgré l’incident</strong><small>{affected[0].report.title} · {affected[0].report.location}</small><b>Retard estimé intégré : +{delay} min</b></p></article>;
  } else if (impact?.unconfirmed.length) {
    incident = <button type="button" className="incident-card incident-card--pending" onClick={onReport}><span><TriangleAlert size={25} /></span><p><strong>{impact.unconfirmed.length} signalement(s) à confirmer sur votre trajet</strong><small><Users size={14} /> {impact.unconfirmed[0].report.title} · {impact.unconfirmed[0].report.location}</small><b>Aucun retard appliqué tant qu’un autre usager ne l’a pas confirmé</b></p><ArrowRight /></button>;
  } else {
    incident = <button type="button" className="incident-card incident-card--calm" onClick={onReport}><span><ShieldCheck size={25} /></span><p><strong>{impactUnavailable ? "Signalements indisponibles pour le moment" : "Aucun incident confirmé sur votre trajet"}</strong><small><Users size={14} /> Signalements communautaires en direct</small><b>Vous voyez un problème ? Signalez-le</b></p><ArrowRight /></button>;
  }

  return <section className="app-screen active-screen"><ScreenHeader title="Trajet en cours" onBack={onBack} bell={() => notify(summary)} /><div className="active-map"><SiraMap origin={origin} destination={destination} journeys={currentAlternative ? [journey, currentAlternative] : [journey]} selectedJourneyId={currentAlternative?.id ?? journey.id} reports={reports} /></div><div className="active-sheet"><div className="next-step"><span><ModeIcon mode={nextLeg.mode} /></span><p><strong>Prochaine étape : {nextLeg.label}</strong><small>{nextLeg.detail}</small></p><button type="button" aria-label="Afficher les étapes"><ChevronDown /></button></div><div className="live-stats"><span><Clock3 /><small>Temps restant</small><strong>{journey.duration + (affected.length ? delay : 0)} min</strong></span><span><WalletCards /><small>Budget estimé</small><strong>{journey.price} FCFA</strong></span><span><Route /><small>Correspondance</small><strong>{transfers}</strong></span></div>{incident}{affected.length > 0 && !kept && !currentAlternative && <button type="button" className="inline-primary reroute-button" onClick={findAlternative} disabled={rerouting}>{rerouting ? "Recherche d’une alternative…" : "Voir une alternative"}<ArrowRight size={20} /></button>}{currentMessage && <p className="reroute-message">{currentMessage}</p>}{currentAlternative && <article className="alternative-card"><span><Route /></span><div><h2>Alternative disponible</h2><div><p>Durée estimée<strong>{currentAlternative.duration} min</strong></p><p>Coût estimé<strong>{currentAlternative.price.toLocaleString("fr-FR")} FCFA</strong></p>{budget === null ? <p>Correspondances<strong>{currentAlternative.transferCount ?? 0}</strong></p> : <p>Budget<strong>{currentAlternative.price <= budget ? "Respecté" : "Dépassé"}</strong></p>}</div><small className="alternative-compare">Trajet actuel avec le retard : environ {journey.duration + delay} min. Cette option évite la zone signalée.</small></div><footer><button type="button" onClick={() => { onAdopt(currentAlternative); setAlternative(null); }}>Utiliser ce trajet</button><button type="button" onClick={() => { setAlternative(null); setKeptImpactKey(impactKey); }}>Garder mon trajet</button></footer></article>}</div></section>;
}

const incidentTypes = [
  { id: "accident", label: "Accident", icon: TrafficCone }, { id: "traffic", label: "Embouteillage", icon: Navigation },
  { id: "flood", label: "Route inondée", icon: CloudRain }, { id: "works", label: "Travaux", icon: Construction },
  { id: "blocked", label: "Route bloquée", icon: TrafficCone }, { id: "transport", label: "Problème transport", icon: BusFront },
  { id: "other", label: "Autre", icon: CircleEllipsis },
];

function ReportScreen({ reports, fallback, votedIds, onBack, onCreate, onVote }: {
  reports: TrafficReport[]; fallback: Place; votedIds: string[]; onBack: () => void;
  onCreate: (input: { type: string; lat: number; lon: number; location: string; description: string }) => Promise<void>;
  onVote: (report: TrafficReport, kind: "confirm" | "contest") => Promise<void>;
}) {
  const [type, setType] = useState("accident");
  const [comment, setComment] = useState("");
  const [gpsPosition, setGpsPosition] = useState<{ coordinates: Coordinates; detail: string; at: Date } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(() => typeof navigator !== "undefined" && !navigator.geolocation ? "GPS indisponible" : null);
  const [locating, setLocating] = useState(() => typeof navigator !== "undefined" && Boolean(navigator.geolocation));
  const [submitting, setSubmitting] = useState(false);
  const [voting, setVoting] = useState<string | null>(null);

  const requestPosition = useCallback(() => {
    navigator.geolocation?.getCurrentPosition((position) => {
      setGpsPosition({ coordinates: [position.coords.longitude, position.coords.latitude], detail: `GPS · précision ±${Math.round(position.coords.accuracy)} m`, at: new Date() });
      setGpsError(null); setLocating(false);
    }, () => { setGpsError("GPS refusé"); setLocating(false); }, { enableHighAccuracy: true, timeout: 9000 });
  }, []);
  useEffect(() => { requestPosition(); }, [requestPosition]);
  const relocate = () => { if (!navigator.geolocation) return; setLocating(true); requestPosition(); };

  // Without GPS the report is placed at the journey origin, and the screen says so.
  const position = gpsPosition ?? { coordinates: fallback.coordinates, detail: `${gpsError ?? "Localisation en cours"} · point de départ utilisé`, at: null };
  const label = gpsPosition ? nearestPlaceLabel(gpsPosition.coordinates) : fallback.name;
  const nearby = reports
    .map((report) => ({ report, distance: distanceM(position.coordinates, [report.lon, report.lat]) }))
    .filter((item) => item.distance <= 5000)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5);

  const submit = async () => {
    setSubmitting(true);
    try { await onCreate({ type, lat: position.coordinates[1], lon: position.coordinates[0], location: label, description: comment }); }
    finally { setSubmitting(false); }
  };
  const vote = async (report: TrafficReport, kind: "confirm" | "contest") => {
    setVoting(report.id);
    try { await onVote(report, kind); } finally { setVoting(null); }
  };

  return <section className="app-screen content-screen report-screen"><header className="report-header"><button type="button" onClick={onBack} aria-label="Retour"><ArrowLeft /></button><div><h1>Signaler un incident</h1><p>Aidez la communauté en signalant ce que vous voyez</p></div></header><form className="report-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}><label>Où se situe l’incident ?</label><div className="report-location"><MapPin /><span>{locating ? "Localisation…" : label}</span><button type="button" onClick={relocate} aria-label="Relancer la localisation"><LocateFixed /></button></div><label>Quel est le type d’incident ?</label><div className="incident-grid">{incidentTypes.map(({ id, label: typeLabel, icon: Icon }) => <button type="button" key={id} className={type === id ? "selected" : ""} onClick={() => setType(id)}><Icon /><span>{typeLabel}</span></button>)}</div><label htmlFor="report-comment">Ajouter un commentaire <small>(optionnel)</small></label><textarea id="report-comment" value={comment} maxLength={280} onChange={(event) => setComment(event.target.value)} placeholder="Ajoutez un commentaire…" /><label>Ajouter une photo <small>(prochaine version)</small></label><div className="photo-upload photo-upload--disabled" aria-disabled="true"><Camera /><span>Photo bientôt disponible</span></div><div className="detected-location"><Crosshair /><span><strong>{gpsPosition ? "Localisation détectée" : "Localisation approximative"}</strong><small>{position.detail}</small></span><em>{position.at ? <>À l’instant<br /><small>{position.at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</small></> : null}</em></div><button className="primary-button" type="submit" disabled={submitting || locating}>{submitting ? "Envoi…" : "Envoyer le signalement"}<ArrowRight /></button></form><section className="nearby-reports" aria-label="Signalements à proximité"><h2>À proximité</h2><p>Confirmez ce que vous voyez : un incident n’influence les trajets qu’après confirmation par un autre usager.</p>{nearby.length ? <ul>{nearby.map(({ report, distance }) => <li key={report.id} className="nearby-report"><span><TriangleAlert size={17} /></span><p><strong>{report.title}</strong><small>{report.location} · {formatDistance(distance)} · {timeAgo(report.createdAt)}</small>{report.description && <small>« {report.description} »</small>}<em className={`report-status report-status--${report.status}`}>{reportStatusLabel[report.status]} · {report.confirmations} confirmation(s) · {report.contests} contestation(s)</em></p>{votedIds.includes(report.id) ? <small className="vote-done">Votre avis est enregistré.</small> : <div className="vote-buttons"><button type="button" disabled={voting === report.id} onClick={() => void vote(report, "confirm")}><ThumbsUp size={15} />Je confirme</button><button type="button" disabled={voting === report.id} onClick={() => void vote(report, "contest")}><ThumbsDown size={15} />Plus là</button></div>}</li>)}</ul> : <p className="nearby-empty">Aucun signalement actif dans un rayon de 5 km.</p>}</section></section>;
}

function AssistantSheet({ answer, value, onValue, onAsk, onClose }: { answer: string; value: string; onValue: (value: string) => void; onAsk: (preset?: string) => void; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="assistant-sheet" role="dialog" aria-modal="true" aria-label="Assistant mobilité SIRA"><header><span><Bot /></span><p><strong>Assistant SIRA</strong><small>Disponible maintenant</small></p><button type="button" onClick={onClose}><X /></button></header><div className="assistant-answer"><Sparkles /><p>{answer}</p></div><div className="assistant-prompts"><button type="button" onClick={() => onAsk("Quel est le trajet le moins cher ?")}>Le moins cher ?</button><button type="button" onClick={() => onAsk("Y a-t-il des incidents ?")}>Incidents ?</button></div><form onSubmit={(event) => { event.preventDefault(); onAsk(); }}><Mic /><input value={value} onChange={(event) => onValue(event.target.value)} placeholder="Posez votre question…" /><button type="submit"><Send /></button></form></section></div>;
}

export default function SiraApp() {
  const [showSplash, setShowSplash] = useState(true);
  const [screen, setScreen] = useState<Screen>("home");
  const [origin, setOrigin] = useState<Place>(originDefault);
  const [destination, setDestination] = useState<Place>(destinationDefault);
  const [options, setOptions] = useState<SearchOptions>(DEFAULT_OPTIONS);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [departureTime, setDepartureTime] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<SearchQuery | null>(null);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [selectedJourneyId, setSelectedJourneyId] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("Bonjour 👋 Indiquez un départ et une destination : je compare les trajets selon vos préférences et les signalements de la communauté.");
  const [reports, setReports] = useState<TrafficReport[]>([]);
  const [clientId] = useState(() => typeof window === "undefined" ? "" : readClientId());
  const [votedIds, setVotedIds] = useState<string[]>(() => typeof window === "undefined" ? [] : readVotedIds());
  const [reportReturn, setReportReturn] = useState<Screen>("home");
  const selectedJourney = useMemo(() => journeys.find((journey) => journey.id === selectedJourneyId) ?? journeys[0], [journeys, selectedJourneyId]);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 3200); };

  useEffect(() => { const timer = window.setTimeout(() => setShowSplash(false), 1350); return () => window.clearTimeout(timer); }, []);

  const upsertReport = useCallback((report: TrafficReport) => setReports((current) => {
    const rest = current.filter((item) => item.id !== report.id);
    return ACTIVE_REPORT_STATUSES.includes(report.status) ? [report, ...rest] : rest;
  }), []);

  useEffect(() => {
    let cancelled = false;
    const load = () => apiJson<TrafficReport[]>("/reports").then((value) => { if (!cancelled) setReports(value); }).catch(() => { /* API hors ligne : aucun signalement affiché */ });
    void load();
    const socket = io(`${socketOrigin()}/traffic`, { transports: ["websocket", "polling"], reconnectionAttempts: 5 });
    socket.on("traffic.report.created", upsertReport);
    socket.on("traffic.report.updated", upsertReport);
    socket.on("connect", load);
    // Periodic reload drops expired events, which the server does not broadcast.
    const refresh = window.setInterval(load, 60_000);
    return () => { cancelled = true; socket.disconnect(); window.clearInterval(refresh); };
  }, [upsertReport]);

  const rememberVote = (id: string) => setVotedIds((current) => {
    const next = [id, ...current.filter((item) => item !== id)].slice(0, 200);
    storage.set(VOTED_KEY, JSON.stringify(next));
    return next;
  });

  const locateUser = () => {
    if (!navigator.geolocation) return notify("La géolocalisation n’est pas disponible sur cet appareil.");
    navigator.geolocation.getCurrentPosition((position) => { setOrigin({ id: "my-location", name: "Ma position", detail: `Précision ±${Math.round(position.coords.accuracy)} m`, coordinates: [position.coords.longitude, position.coords.latitude] }); notify("Position détectée avec succès."); }, () => notify("Autorisez l’accès à votre position pour utiliser le GPS."), { enableHighAccuracy: true, timeout: 9000 });
  };

  const calculate = async () => {
    const query: SearchQuery = { origin, destination, ...options, departureTime };
    setCalculating(true);
    setSearchStatus("Connexion au moteur SIRA…");
    const progressTimer = window.setTimeout(() => setSearchStatus("Recherche des lignes et raccordements piétons…"), 5000);
    try {
      const { journeys: next, rejectedCount } = await fetchJourneys(query);
      if (!next.length) {
        const message = rejectedCount ? "Aucun trajet ne respecte toutes vos contraintes. Augmentez le budget ou la marche maximale." : "Aucun parcours suivant le réseau n’a été trouvé entre ces deux points.";
        setSearchStatus(message);
        notify(message);
        return;
      }
      setLastQuery(query); setJourneys(next); setSelectedJourneyId((next.find((journey) => journey.recommended) ?? next[0]).id); setSearchStatus(null); setScreen("results");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Le calcul SIRA a échoué.";
      setSearchStatus(message);
      notify(message);
    } finally {
      window.clearTimeout(progressTimer);
      setCalculating(false);
    }
  };

  // Recalculates with the last search constraints while routing around the given areas.
  const reroute = async (avoid: AvoidArea[]) => {
    if (!lastQuery) return null;
    const { journeys: next } = await fetchJourneys(lastQuery, avoid);
    const best = next.find((journey) => journey.recommended) ?? next[0];
    return best ? { ...best, id: `${best.id}~${Date.now().toString(36)}`, label: "Alternative SIRA", recommended: true } : null;
  };

  const adoptJourney = (journey: Journey) => {
    setJourneys([journey]); setSelectedJourneyId(journey.id);
    notify("Nouvel itinéraire activé. SIRA continue de surveiller votre trajet.");
  };

  const openReport = () => { if (screen !== "report") setReportReturn(screen); setScreen("report"); };

  const createReport = async (input: { type: string; lat: number; lon: number; location: string; description: string }) => {
    try {
      const report = await apiJson<TrafficReport>("/reports", { method: "POST", body: JSON.stringify({ ...input, clientId }) });
      upsertReport(report); rememberVote(report.id);
      notify("Merci ! Votre signalement est visible. Il comptera dès qu’un autre usager le confirme.");
      setScreen(reportReturn);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Envoi du signalement impossible.");
    }
  };

  const voteReport = async (report: TrafficReport, kind: "confirm" | "contest") => {
    try {
      const updated = await apiJson<TrafficReport>(`/reports/${encodeURIComponent(report.id)}/${kind}`, { method: "POST", body: JSON.stringify({ clientId }) });
      upsertReport(updated); rememberVote(report.id);
      notify(kind === "confirm" ? "Merci, confirmation enregistrée." : "Merci, votre avis a été enregistré.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Vote impossible pour le moment.";
      if (/déjà donné/.test(message)) rememberVote(report.id);
      notify(message);
    }
  };

  const askAssistant = (preset?: string) => {
    const question = (preset ?? assistantInput).trim(); if (!question) return;
    const cheapest = [...journeys].sort((a, b) => a.price - b.price)[0];
    const confirmed = reports.filter((report) => report.status === "confirmed" || report.status === "reliable");
    if (/moins cher|budget|économ/i.test(question) && cheapest) setAssistantAnswer(`Le trajet « ${cheapest.label} » coûte ${cheapest.price.toLocaleString("fr-FR")} FCFA pour environ ${cheapest.duration} minutes.`);
    else if (/moins cher|budget|économ/i.test(question)) setAssistantAnswer("Lancez d’abord une recherche pour comparer les coûts qui respectent votre budget.");
    else if (/incident|trafic|route|accident|bouchon|embouteillage/i.test(question)) {
      if (confirmed.length) setAssistantAnswer(`${confirmed.length} incident(s) confirmé(s) par la communauté : ${confirmed.slice(0, 3).map((report) => `${report.title.toLowerCase()} (${report.location})`).join(" ; ")}. Démarrez votre trajet pour savoir s’il est concerné.`);
      else if (reports.length) setAssistantAnswer(`${reports.length} signalement(s) en attente de confirmation, aucun incident confirmé pour le moment.`);
      else setAssistantAnswer("Aucun incident signalé par la communauté pour le moment.");
    }
    else if (selectedJourney) setAssistantAnswer(`Je vous recommande « ${selectedJourney.label} » : environ ${selectedJourney.duration} min pour ${selectedJourney.price.toLocaleString("fr-FR")} FCFA estimés.${selectedJourney.reasons.length ? ` ${selectedJourney.reasons.slice(0, 2).join(" · ")}.` : ""}`);
    else setAssistantAnswer("Indiquez un départ et une destination dans le Grand Abidjan, puis lancez le calcul SIRA-MORE.");
    setAssistantInput("");
  };

  const selectJourney = (journey: Journey) => { setSelectedJourneyId(journey.id); setScreen("detail"); };
  const searched: SearchQuery = lastQuery ?? { origin, destination, ...options, departureTime };
  const activeOptions = Number(options.preference !== DEFAULT_OPTIONS.preference) + Number(options.excludedModes.length > 0) + Number(options.maxWalking !== DEFAULT_OPTIONS.maxWalking) + Number(options.budget !== null);
  return <main className="sira-stage"><div className="phone-app">{showSplash ? <Splash /> : <>{screen === "home" && <HomeScreen origin={origin} destination={destination} departureTime={departureTime} activeOptions={activeOptions} reports={reports} onOrigin={setOrigin} onDestination={setDestination} onDepartureTime={setDepartureTime} onOptions={() => setOptionsOpen(true)} onLocate={locateUser} onSearch={calculate} calculating={calculating} searchStatus={searchStatus} onAssistant={() => setAssistantOpen(true)} />}{screen === "results" && <ResultsScreen query={searched} journeys={journeys} reports={reports} selectedId={selectedJourneyId} onSelect={selectJourney} onBack={() => setScreen("home")} />}{screen === "detail" && selectedJourney && <DetailScreen journey={selectedJourney} destination={searched.destination} departureAt={departureDate(searched.departureTime)} onBack={() => setScreen("results")} onStart={() => setScreen("active")} />}{screen === "active" && selectedJourney && <ActiveScreen origin={searched.origin} destination={searched.destination} journey={selectedJourney} reports={reports} budget={searched.budget} onBack={() => setScreen("detail")} onReport={openReport} onReroute={reroute} onAdopt={adoptJourney} notify={notify} />}{screen === "report" && <ReportScreen reports={reports} fallback={searched.origin} votedIds={votedIds} onBack={() => setScreen(reportReturn)} onCreate={createReport} onVote={voteReport} />}<BottomNav screen={screen} onChange={(next) => next === "report" ? openReport() : setScreen(next)} notify={notify} /></>}{optionsOpen && <OptionsSheet options={options} onChange={setOptions} onClose={() => setOptionsOpen(false)} />}{assistantOpen && <AssistantSheet answer={assistantAnswer} value={assistantInput} onValue={setAssistantInput} onAsk={askAssistant} onClose={() => setAssistantOpen(false)} />}{toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}</div></main>;
}
