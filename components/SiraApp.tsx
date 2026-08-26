"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft, ArrowRight, Bell, Bot, BusFront, Camera,
  Check, ChevronDown, CircleEllipsis, Clock3, CloudRain, Construction,
  Crosshair, Footprints, Heart, Home, LocateFixed, MapPin, Mic, Navigation,
  Route, Send, Sparkles, Star, TrafficCone, TriangleAlert, UserRound, Users,
  WalletCards, Waves, X,
} from "lucide-react";
import {
  PLACES, type Coordinates, type Journey, type Place,
  type TravelStep,
} from "@/lib/sira-data";

const SiraMap = dynamic(() => import("@/components/SiraMap"), { ssr: false });

type Screen = "home" | "results" | "detail" | "active" | "report";
type Preference = "balanced" | "fast" | "cheap" | "comfort";
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
    { label: "Profil", icon: UserRound, active: false, action: () => notify("Le profil sera relié à votre compte Max it.") },
  ];
  return <nav className="bottom-nav" aria-label="Navigation principale">{items.map(({ label, icon: Icon, active, action }) => <button type="button" key={label} className={active ? "active" : ""} onClick={action}><Icon size={22} strokeWidth={1.9} /><small>{label}</small></button>)}</nav>;
}

function Splash() {
  return <section className="splash-screen" aria-label="Chargement de SIRA"><div className="splash-brand"><strong>SIRA</strong><span>On trace sans stress</span></div><div className="city-line" aria-hidden="true"><span /><span /><span /><span /><span /></div><div className="splash-loader"><span className="splash-bus"><BusFront size={27} /></span><p>Chargement de votre trajet…</p><i><b /></i></div></section>;
}

function HomeScreen({ origin, destination, budget, preference, maxWalking, onOrigin, onDestination, onBudget, onPreference, onMaxWalking, onLocate, onSearch, calculating, searchStatus, onAssistant }: {
  origin: Place; destination: Place; budget: number; preference: Preference; maxWalking: number; onOrigin: (place: Place) => void; onDestination: (place: Place) => void; onBudget: (value: number) => void; onPreference: (value: Preference) => void; onMaxWalking: (value: number) => void; onLocate: () => void; onSearch: () => void; calculating: boolean; searchStatus: string | null; onAssistant: () => void;
}) {
  return <section className="app-screen home-screen"><header className="home-brand"><strong>SIRA</strong><span>On trace sans stress</span><em>Réseau Grand Abidjan</em></header><div className="home-card"><h1>Où voulez-vous aller&nbsp;?</h1><div className="route-fields"><PlaceField key={origin.id} value={origin} placeholder="Ma position" origin onSelect={onOrigin} onLocate={onLocate} /><PlaceField key={destination.id} value={destination} placeholder="Destination" onSelect={onDestination} /></div><div className="journey-preferences"><label>Budget max<input type="number" min="0" step="100" value={budget} onChange={(event) => onBudget(Math.max(0, Number(event.target.value)))} /><small>FCFA</small></label><label>Priorité<select value={preference} onChange={(event) => onPreference(event.target.value as Preference)}><option value="balanced">Compromis</option><option value="fast">Rapide</option><option value="cheap">Économique</option><option value="comfort">Confort</option></select></label><label>Marche max<select value={maxWalking} onChange={(event) => onMaxWalking(Number(event.target.value))}><option value={600}>600 m</option><option value={1000}>1 km</option><option value={1500}>1,5 km</option><option value={2500}>2,5 km</option></select></label></div></div><div className="home-map"><SiraMap origin={origin} destination={destination} journeys={[]} selectedJourneyId="" /><div className="map-place-label">Grand Abidjan</div><button type="button" className="assistant-map-button" onClick={onAssistant} aria-label="Ouvrir l'assistant SIRA"><Bot size={20} /></button></div><div className="home-action-wrap">{searchStatus && <p className={`search-status ${calculating ? "loading" : "error"}`}>{searchStatus}</p>}<button className="primary-button" type="button" onClick={onSearch} disabled={calculating}>{calculating ? "Calcul SIRA-MORE…" : "Rechercher un trajet"}<ArrowRight size={22} /></button></div></section>;
}

function ResultCard({ journey, selected, onSelect }: { journey: Journey; selected: boolean; onSelect: () => void }) {
  const modes = journey.steps.filter((step, index, all) => all.findIndex((item) => item.mode === step.mode) === index).slice(0, 4);
  return <article className={`result-card ${selected ? "recommended" : ""}`}><div className="result-icon">{journey.profileTags?.includes("fastest") ? <Clock3 /> : journey.profileTags?.includes("cheapest") ? <WalletCards /> : <Star />}</div><div className="result-copy"><span className="result-label">{journey.label}</span><small className="result-description">{journey.description}</small><div className="result-numbers"><strong>{journey.duration} <small>min</small></strong><strong>{journey.price.toLocaleString("fr-FR")} <small>FCFA</small></strong></div>{selected && <><p className="journey-metrics">P90 {journey.durationP90 ?? journey.duration} min · {journey.waiting ?? 0} min d’attente · {journey.transferCount ?? 0} correspondance(s)</p><div className="mode-strip">{modes.map((step, index) => <span key={`${step.mode}-${index}`}><ModeIcon mode={step.mode} /><small>{modeMeta[step.mode].label}<b>{step.duration} min</b></small>{index < modes.length - 1 && <ArrowRight size={14} />}</span>)}</div><div className="recommendation-reasons">{journey.reasons.map((reason) => <span key={reason}><Check size={12} />{reason}</span>)}</div><button type="button" className="inline-primary" onClick={onSelect}>Voir le trajet<ArrowRight size={20} /></button></>}</div>{!selected && <button className="card-hit" aria-label={`Choisir ${journey.label}`} type="button" onClick={onSelect} />}</article>;
}

function ResultsScreen({ origin, destination, budget, preference, journeys, selectedId, onSelect, onBack }: {
  origin: Place; destination: Place; budget: number; preference: Preference; journeys: Journey[]; selectedId: string; onSelect: (journey: Journey) => void; onBack: () => void;
}) {
  const ordered = [...journeys].sort((a, b) => a.recommended ? -1 : b.recommended ? 1 : a.duration - b.duration);
  return <section className="app-screen content-screen"><ScreenHeader title="Trajets proposés" onBack={onBack} /><div className="route-summary"><span><Crosshair /><b>Départ</b><em>{origin.name}</em></span><span><MapPin /><b>Destination</b><em>{destination.name}</em></span><span><WalletCards /><b>Budget max</b><em>{budget.toLocaleString("fr-FR")} FCFA</em></span><span><Star /><b>Préférence</b><em>{preference === "fast" ? "Le plus rapide" : preference === "cheap" ? "Le moins cher" : preference === "comfort" ? "Confort" : "Meilleur compromis"}</em></span></div><div className="results-map"><SiraMap origin={origin} destination={destination} journeys={journeys} selectedJourneyId={selectedId} /></div><p className="data-banner"><Route size={15} />SIRA-MORE · contraintes → Pareto → diversité → score explicable · 325 lignes Grand Abidjan</p><div className="results-list">{ordered.map((journey) => <ResultCard key={journey.id} journey={journey} selected={journey.id === selectedId} onSelect={() => onSelect(journey)} />)}</div></section>;
}

function DetailScreen({ journey, destination, onBack, onStart }: { journey: Journey; destination: Place; onBack: () => void; onStart: () => void }) {
  const departure = new Date();
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

function ActiveScreen({ origin, destination, journey, onBack, notify }: { origin: Place; destination: Place; journey: Journey; onBack: () => void; notify: (message: string) => void }) {
  const nextLeg = journey.legs.find((leg) => !["walk", "wait", "transfer"].includes(leg.mode)) ?? journey.legs[0];
  const transfers = journey.legs.filter((leg) => leg.mode === "transfer").length;
  return <section className="app-screen active-screen"><ScreenHeader title="Trajet en cours" onBack={onBack} bell={() => notify("Aucune nouvelle alerte sur ce trajet.")} /><div className="active-map"><SiraMap origin={origin} destination={destination} journeys={[journey]} selectedJourneyId={journey.id} /></div><div className="active-sheet"><div className="next-step"><span><ModeIcon mode={nextLeg.mode} /></span><p><strong>Prochaine étape : {nextLeg.label}</strong><small>{nextLeg.detail}</small></p><button type="button" aria-label="Afficher les étapes"><ChevronDown /></button></div><div className="live-stats"><span><Clock3 /><small>Temps restant</small><strong>{journey.duration} min</strong></span><span><WalletCards /><small>Budget estimé</small><strong>{journey.price} FCFA</strong></span><span><Route /><small>Correspondance</small><strong>{transfers}</strong></span></div><article className="incident-card"><span><TriangleAlert size={25} /></span><p><strong>Les incidents temps réel ne sont pas encore connectés</strong><small><Users size={14} /> Module communautaire en préparation</small><b>Aucun retard réel injecté dans cette estimation</b></p><ArrowRight /></article></div></section>;
}

const incidentTypes = [
  { id: "accident", label: "Accident", icon: TrafficCone }, { id: "traffic", label: "Embouteillage", icon: Navigation },
  { id: "flood", label: "Route inondée", icon: CloudRain }, { id: "works", label: "Travaux", icon: Construction },
  { id: "blocked", label: "Route bloquée", icon: TrafficCone }, { id: "transport", label: "Problème transport", icon: BusFront },
  { id: "other", label: "Autre", icon: CircleEllipsis },
];

function ReportScreen({ onBack, onSubmit }: { onBack: () => void; onSubmit: (message: string) => void }) {
  const [type, setType] = useState("flood");
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState("");
  return <section className="app-screen content-screen report-screen"><header className="report-header"><button type="button" onClick={onBack} aria-label="Retour"><ArrowLeft /></button><div><h1>Signaler un incident</h1><p>Aidez la communauté en signalant ce que vous voyez</p></div></header><form className="report-form" onSubmit={(event) => { event.preventDefault(); onSubmit("Merci ! Votre signalement a été transmis à la communauté SIRA."); }}><label>Où se situe l’incident ?</label><div className="report-location"><MapPin /><span>Riviera 3</span><LocateFixed /></div><label>Quel est le type d’incident ?</label><div className="incident-grid">{incidentTypes.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={type === id ? "selected" : ""} onClick={() => setType(id)}><Icon /><span>{label}</span></button>)}</div><label htmlFor="report-comment">Ajouter un commentaire <small>(optionnel)</small></label><textarea id="report-comment" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Ajoutez un commentaire…" /><label htmlFor="report-photo">Ajouter une photo <small>(optionnel)</small></label><label className="photo-upload" htmlFor="report-photo"><Camera /><span>{photo || "Ajouter une photo"}</span></label><input id="report-photo" className="hidden-file" type="file" accept="image/*" onChange={(event) => setPhoto(event.target.files?.[0]?.name ?? "")} /><div className="detected-location"><Crosshair /><span><strong>Localisation détectée</strong><small>Riviera 3, Abidjan</small></span><em>À l’instant<br /><small>09:41</small></em></div><button className="primary-button" type="submit">Envoyer le signalement<ArrowRight /></button></form></section>;
}

function AssistantSheet({ answer, value, onValue, onAsk, onClose }: { answer: string; value: string; onValue: (value: string) => void; onAsk: (preset?: string) => void; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="assistant-sheet" role="dialog" aria-modal="true" aria-label="Assistant mobilité SIRA"><header><span><Bot /></span><p><strong>Assistant SIRA</strong><small>Disponible maintenant</small></p><button type="button" onClick={onClose}><X /></button></header><div className="assistant-answer"><Sparkles /><p>{answer}</p></div><div className="assistant-prompts"><button type="button" onClick={() => onAsk("Quel est le trajet le moins cher ?")}>Le moins cher ?</button><button type="button" onClick={() => onAsk("Y a-t-il des incidents ?")}>Incidents ?</button></div><form onSubmit={(event) => { event.preventDefault(); onAsk(); }}><Mic /><input value={value} onChange={(event) => onValue(event.target.value)} placeholder="Posez votre question…" /><button type="submit"><Send /></button></form></section></div>;
}

export default function SiraApp() {
  const [showSplash, setShowSplash] = useState(true);
  const [screen, setScreen] = useState<Screen>("home");
  const [origin, setOrigin] = useState<Place>(originDefault);
  const [destination, setDestination] = useState<Place>(destinationDefault);
  const [budget, setBudget] = useState(1500);
  const [preference, setPreference] = useState<Preference>("balanced");
  const [maxWalking, setMaxWalking] = useState(1500);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [selectedJourneyId, setSelectedJourneyId] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("Bonjour Achille 👋 Je peux trouver un trajet adapté à ton budget et aux conditions de circulation.");
  const selectedJourney = useMemo(() => journeys.find((journey) => journey.id === selectedJourneyId) ?? journeys[0], [journeys, selectedJourneyId]);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 3200); };

  useEffect(() => { const timer = window.setTimeout(() => setShowSplash(false), 1350); return () => window.clearTimeout(timer); }, []);

  const locateUser = () => {
    if (!navigator.geolocation) return notify("La géolocalisation n’est pas disponible sur cet appareil.");
    navigator.geolocation.getCurrentPosition((position) => { setOrigin({ id: "my-location", name: "Ma position", detail: `Précision ±${Math.round(position.coords.accuracy)} m`, coordinates: [position.coords.longitude, position.coords.latitude] }); notify("Position détectée avec succès."); }, () => notify("Autorisez l’accès à votre position pour utiliser le GPS."), { enableHighAccuracy: true, timeout: 9000 });
  };

  const calculate = async () => {
    setCalculating(true);
    setSearchStatus("Connexion au moteur SIRA…");
    const progressTimer = window.setTimeout(() => setSearchStatus("Recherche des lignes et raccordements piétons…"), 5000);
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "/api/v1").replace(/\/$/, "");
    try {
      const response = await fetch(`${apiUrl}/mobility/journeys`, { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(30_000), body: JSON.stringify({ origin: { lat: origin.coordinates[1], lon: origin.coordinates[0], name: origin.name }, destination: { lat: destination.coordinates[1], lon: destination.coordinates[0], name: destination.name }, budget, preference, constraints: { maxWalkingDistanceM: maxWalking, maxTransfers: 3, excludedModes: [] } }) });
      if (!response.ok) {
        let message = `Le calcul SIRA a échoué (${response.status}).`;
        try {
          const errorPayload = await response.json() as { message?: string | string[] };
          if (Array.isArray(errorPayload.message)) message = errorPayload.message.join(" ");
          else if (errorPayload.message) message = errorPayload.message;
        } catch { /* réponse non JSON */ }
        throw new Error(message);
      }
      const data = await response.json() as { journeys?: ApiJourney[]; recommended_id?: string | null; rejected?: unknown[] };
      const next: Journey[] = (data.journeys ?? []).flatMap((apiJourney) => {
        const geometry = apiJourney.geometry?.length ? apiJourney.geometry : apiJourney.shape ? decodeValhallaShape(apiJourney.shape) : [];
        const legs = apiJourney.legs ?? [];
        if (!geometry.length || !legs.length) return [];
        const tags = apiJourney.profile_tags ?? [];
        const recommended = apiJourney.id === data.recommended_id || apiJourney.recommended === true;
        const label = recommended ? "Recommandé par SIRA" : tags.includes("fastest") ? "Le plus rapide" : tags.includes("cheapest") ? "Le moins cher" : apiJourney.label ?? "Alternative SIRA";
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
      if (!next.length) {
        const message = data.rejected?.length ? "Aucun trajet ne respecte toutes vos contraintes. Augmentez le budget ou la marche maximale." : "Aucun parcours suivant le réseau n’a été trouvé entre ces deux points.";
        setSearchStatus(message);
        notify(message);
        return;
      }
      const recommendedId = data.recommended_id ?? next[0].id;
      setJourneys(next); setSelectedJourneyId(recommendedId); setSearchStatus(null); setScreen("results");
    } catch (error) {
      const message = error instanceof Error && error.message !== "Failed to fetch"
        ? error.message
        : "API SIRA inaccessible. Vérifiez que la stack complète est toujours ouverte sur le PC.";
      setSearchStatus(message);
      notify(message);
    } finally {
      window.clearTimeout(progressTimer);
      setCalculating(false);
    }
  };

  const askAssistant = (preset?: string) => {
    const question = (preset ?? assistantInput).trim(); if (!question) return;
    const cheapest = [...journeys].sort((a, b) => a.price - b.price)[0];
    if (/moins cher|budget|économ/i.test(question) && cheapest) setAssistantAnswer(`Le trajet « ${cheapest.label} » coûte ${cheapest.price.toLocaleString("fr-FR")} FCFA pour environ ${cheapest.duration} minutes.`);
    else if (/moins cher|budget|économ/i.test(question)) setAssistantAnswer("Lancez d’abord une recherche pour comparer les coûts qui respectent votre budget.");
    else if (/incident|trafic|route/i.test(question)) setAssistantAnswer("Un accident est signalé au Pont De Gaulle. SIRA propose une alternative qui respecte votre budget.");
    else if (selectedJourney) setAssistantAnswer(`Je vous recommande l’option à ${selectedJourney.price.toLocaleString("fr-FR")} FCFA : elle combine marche, attente et transport avec le meilleur compromis.`);
    else setAssistantAnswer("Indiquez un départ et une destination dans le Grand Abidjan, puis lancez le calcul SIRA-MORE.");
    setAssistantInput("");
  };

  const selectJourney = (journey: Journey) => { setSelectedJourneyId(journey.id); setScreen("detail"); };
  return <main className="sira-stage"><div className="phone-app">{showSplash ? <Splash /> : <>{screen === "home" && <HomeScreen origin={origin} destination={destination} budget={budget} preference={preference} maxWalking={maxWalking} onOrigin={setOrigin} onDestination={setDestination} onBudget={setBudget} onPreference={setPreference} onMaxWalking={setMaxWalking} onLocate={locateUser} onSearch={calculate} calculating={calculating} searchStatus={searchStatus} onAssistant={() => setAssistantOpen(true)} />}{screen === "results" && <ResultsScreen origin={origin} destination={destination} budget={budget} preference={preference} journeys={journeys} selectedId={selectedJourneyId} onSelect={selectJourney} onBack={() => setScreen("home")} />}{screen === "detail" && selectedJourney && <DetailScreen journey={selectedJourney} destination={destination} onBack={() => setScreen("results")} onStart={() => setScreen("active")} />}{screen === "active" && selectedJourney && <ActiveScreen origin={origin} destination={destination} journey={selectedJourney} onBack={() => setScreen("detail")} notify={notify} />}{screen === "report" && <ReportScreen onBack={() => setScreen("home")} onSubmit={(message) => { notify(message); setScreen("home"); }} />}<BottomNav screen={screen} onChange={setScreen} notify={notify} /></>}{assistantOpen && <AssistantSheet answer={assistantAnswer} value={assistantInput} onValue={setAssistantInput} onAsk={askAssistant} onClose={() => setAssistantOpen(false)} />}{toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}</div></main>;
}
