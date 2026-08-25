"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowLeft, ArrowRight, Bell, Bot, BriefcaseBusiness, BusFront, Camera,
  Check, ChevronDown, CircleEllipsis, Clock3, CloudRain, Construction,
  Crosshair, Footprints, Heart, Home, LocateFixed, MapPin, Mic, Navigation,
  Route, Send, Sparkles, Star, TrafficCone, TriangleAlert, UserRound, Users,
  WalletCards, Waves, X,
} from "lucide-react";
import {
  buildJourneys, PLACES, type Coordinates, type Journey, type Place,
  type TravelStep,
} from "@/lib/sira-data";

const SiraMap = dynamic(() => import("@/components/SiraMap"), { ssr: false });

type Screen = "home" | "results" | "detail" | "active" | "report";
type Preference = "balanced" | "fast" | "cheap" | "comfort";
type ApiJourney = Partial<Pick<Journey, "id" | "duration" | "price" | "comfort" | "reliability">> & {
  id: string;
  walking_minutes?: number;
  shape?: string | null;
  geometry?: Coordinates[] | null;
};

const modeMeta: Record<TravelStep["mode"], { icon: typeof Footprints; label: string }> = {
  walk: { icon: Footprints, label: "Marche" },
  gbaka: { icon: BusFront, label: "Gbaka" },
  sotra: { icon: BusFront, label: "Bus" },
  taxi: { icon: Navigation, label: "Taxi" },
  boat: { icon: Waves, label: "Bateau-bus" },
};

const originDefault = PLACES.find((place) => place.id === "plateau") ?? PLACES[0];
const destinationDefault = PLACES.find((place) => place.id === "riviera-2") ?? PLACES[1];

function demoJourneys(): Journey[] {
  return buildJourneys(originDefault, destinationDefault, 1000).map((journey) => {
    if (journey.id === "recommended") return { ...journey, duration: 44, price: 900, walking: 11, badge: "Recommandée" };
    if (journey.id === "fast") return { ...journey, duration: 38, price: 1500, walking: 4 };
    return { ...journey, duration: 55, price: 600, walking: 13 };
  });
}

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

  useEffect(() => setQuery(value.name), [value]);
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

function HomeScreen({ origin, destination, onOrigin, onDestination, onLocate, onSearch, calculating, onAssistant }: {
  origin: Place; destination: Place; onOrigin: (place: Place) => void; onDestination: (place: Place) => void; onLocate: () => void; onSearch: () => void; calculating: boolean; onAssistant: () => void;
}) {
  return <section className="app-screen home-screen"><header className="home-brand"><strong>SIRA</strong><span>On trace sans stress</span></header><div className="home-card"><h1>Où voulez-vous aller&nbsp;?</h1><div className="route-fields"><PlaceField value={origin} placeholder="Ma position" origin onSelect={onOrigin} onLocate={onLocate} /><PlaceField value={destination} placeholder="Destination" onSelect={onDestination} /></div><div className="quick-places"><button type="button"><Home size={18} />Maison</button><button type="button"><BriefcaseBusiness size={18} />Travail</button><button type="button"><Star size={18} />Favoris</button><button type="button"><Clock3 size={18} />Récents</button></div></div><div className="home-map"><SiraMap origin={origin} destination={destination} journeys={[]} selectedJourneyId="" /><div className="map-place-label">Abidjan</div><button type="button" className="assistant-map-button" onClick={onAssistant} aria-label="Ouvrir l'assistant SIRA"><Bot size={20} /></button></div><div className="home-action-wrap"><button className="primary-button" type="button" onClick={onSearch} disabled={calculating}>{calculating ? "Recherche en cours…" : "Rechercher un trajet"}<ArrowRight size={22} /></button></div></section>;
}

function ResultCard({ journey, selected, budget, onSelect }: { journey: Journey; selected: boolean; budget: number; onSelect: () => void }) {
  const modes = journey.steps.filter((step, index, all) => all.findIndex((item) => item.mode === step.mode) === index).slice(0, 3);
  return <article className={`result-card ${selected ? "recommended" : ""}`}><div className="result-icon">{journey.id === "fast" ? <Clock3 /> : journey.id === "cheap" ? <WalletCards /> : <Star />}</div><div className="result-copy"><span className="result-label">{journey.id === "fast" ? "Plus rapide" : journey.id === "cheap" ? "Moins chère" : "Recommandée"}</span><div className="result-numbers"><strong>{journey.duration} <small>min</small></strong><strong>{journey.price.toLocaleString("fr-FR")} <small>FCFA</small></strong></div>{journey.price > budget && <em>Dépasse votre budget</em>}{selected && <><div className="mode-strip">{modes.map((step, index) => <span key={`${step.mode}-${index}`}><ModeIcon mode={step.mode} /><small>{modeMeta[step.mode].label}<b>{step.duration} min</b></small>{index < modes.length - 1 && <ArrowRight size={14} />}</span>)}</div><button type="button" className="inline-primary" onClick={onSelect}>Voir le trajet<ArrowRight size={20} /></button></>}</div>{!selected && <button className="card-hit" aria-label={`Choisir ${journey.label}`} type="button" onClick={onSelect} />}</article>;
}

function ResultsScreen({ origin, destination, budget, preference, journeys, selectedId, onSelect, onBack }: {
  origin: Place; destination: Place; budget: number; preference: Preference; journeys: Journey[]; selectedId: string; onSelect: (journey: Journey) => void; onBack: () => void;
}) {
  const ordered = [...journeys].sort((a, b) => a.id === "recommended" ? 1 : b.id === "recommended" ? -1 : a.duration - b.duration);
  return <section className="app-screen content-screen"><ScreenHeader title="Trajets proposés" onBack={onBack} /><div className="route-summary"><span><Crosshair /><b>Départ</b><em>{origin.name}</em></span><span><MapPin /><b>Destination</b><em>{destination.name}</em></span><span><WalletCards /><b>Budget max</b><em>{budget.toLocaleString("fr-FR")} FCFA</em></span><span><Star /><b>Préférence</b><em>{preference === "fast" ? "Le plus rapide" : preference === "cheap" ? "Le moins cher" : preference === "comfort" ? "Confort" : "Meilleur compromis"}</em></span></div><div className="results-map"><SiraMap origin={origin} destination={destination} journeys={journeys} selectedJourneyId={selectedId} /></div><div className="results-list">{ordered.map((journey) => <ResultCard key={journey.id} journey={journey} selected={journey.id === "recommended"} budget={budget} onSelect={() => onSelect(journey)} />)}</div></section>;
}

function DetailScreen({ journey, destination, onBack, onStart }: { journey: Journey; destination: Place; onBack: () => void; onStart: () => void }) {
  const times = ["09:10", "09:14", "09:32", "09:34", "09:36", "09:53", "09:55", "10:00"];
  const detailSteps = [
    { mode: "walk" as const, title: "Marche 4 min (300 m)", sub: "jusqu’au point d’embarquement · Plateau", active: false },
    { mode: "sotra" as const, title: "Bus 81 direction Cathédrale", sub: "18 min · Coût : 200 FCFA", active: true },
    { mode: "walk" as const, title: "Descendre à Cathédrale", sub: "", active: false },
    { mode: "walk" as const, title: "Marche 2 min (150 m)", sub: "", active: false },
    { mode: "gbaka" as const, title: "Gbaka A7 vers Riviera 3", sub: "17 min · Coût : 500 FCFA", active: true },
    { mode: "walk" as const, title: "Descendre à Riviera 3", sub: "", active: false },
    { mode: "walk" as const, title: "Marche 5 min (350 m)", sub: "jusqu’à la destination", active: false },
    { mode: "walk" as const, title: "Arrivée à destination", sub: destination.name, active: true, finish: true },
  ];
  return <section className="app-screen content-screen detail-screen"><ScreenHeader title="Détail du trajet" onBack={onBack} /><div className="detail-summary"><p><Star size={16} fill="currentColor" /> Option recommandée</p><div><span><strong>{journey.duration}</strong> min<small>Durée totale</small></span><i /><span><strong>{journey.price.toLocaleString("fr-FR")}</strong> FCFA<small>Coût total</small></span></div></div><div className="timeline">{detailSteps.map((step, index) => <div className="timeline-row" key={`${step.title}-${index}`}><time>{times[index]}</time><span className={`timeline-icon ${step.active ? "active" : ""}`}>{step.finish ? <Navigation size={19} fill="currentColor" /> : <ModeIcon mode={step.mode} size={19} />}</span><span className="timeline-copy"><strong>{step.title}</strong>{step.sub && <small>{step.sub}</small>}</span></div>)}</div><div className="sticky-action"><button type="button" className="primary-button" onClick={onStart}>Démarrer le trajet<ArrowRight size={22} /></button></div></section>;
}

function ActiveScreen({ origin, destination, journey, onBack, notify }: { origin: Place; destination: Place; journey: Journey; onBack: () => void; notify: (message: string) => void }) {
  return <section className="app-screen active-screen"><ScreenHeader title="Trajet en cours" onBack={onBack} bell={() => notify("Aucune nouvelle alerte sur ce trajet.")} /><div className="active-map"><SiraMap origin={origin} destination={destination} journeys={[journey]} selectedJourneyId={journey.id} /></div><div className="active-sheet"><div className="next-step"><span><BusFront /></span><p><strong>Prochaine étape : Bus 81</strong><small>Descendre à <b>Cathédrale</b> dans 4 arrêts</small></p><button type="button" aria-label="Afficher les étapes"><ChevronDown /></button></div><div className="live-stats"><span><Clock3 /><small>Temps restant</small><strong>32 min</strong></span><span><WalletCards /><small>Budget estimé</small><strong>{journey.price} FCFA</strong></span><span><Route /><small>Correspondance</small><strong>1</strong></span></div><article className="incident-card"><span><TriangleAlert size={25} /></span><p><strong>Accident signalé au Pont De Gaulle</strong><small><Users size={14} /> Confirmé par 5 utilisateurs</small><b>Retard estimé : +17 min</b></p><ArrowRight /></article><article className="alternative-card"><span><Route /></span><div><h2>Alternative disponible</h2><div><p>Nouveau délai<strong>49 min</strong></p><p>Nouveau coût<strong>950 FCFA</strong></p><p>Budget respecté<strong><Check /></strong></p></div></div><footer><button type="button" onClick={() => notify("Nouvel itinéraire appliqué. Arrivée estimée dans 49 min.")}>Changer d’itinéraire</button><button type="button" onClick={() => notify("Trajet actuel conservé.")}>Garder mon trajet</button></footer></article></div></section>;
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
  const [budget] = useState(1000);
  const [preference] = useState<Preference>("balanced");
  const [journeys, setJourneys] = useState<Journey[]>(demoJourneys());
  const [selectedJourneyId, setSelectedJourneyId] = useState("recommended");
  const [calculating, setCalculating] = useState(false);
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
    let next = buildJourneys(origin, destination, budget);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "/api/v1"}/mobility/journeys`, { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(3500), body: JSON.stringify({ origin: { lat: origin.coordinates[1], lon: origin.coordinates[0], name: origin.name }, destination: { lat: destination.coordinates[1], lon: destination.coordinates[0], name: destination.name }, budget, preference }) });
      if (!response.ok) throw new Error("backend unavailable");
      const data = await response.json() as { journeys?: ApiJourney[] };
      if (data.journeys?.length) next = data.journeys.map((apiJourney) => { const base = next.find((journey) => journey.id === apiJourney.id) ?? next[0]; return { ...base, duration: apiJourney.duration ?? base.duration, price: apiJourney.price ?? base.price, walking: apiJourney.walking_minutes ?? base.walking, comfort: apiJourney.comfort ?? base.comfort, reliability: apiJourney.reliability ?? base.reliability, geometry: apiJourney.geometry?.length ? apiJourney.geometry : apiJourney.shape ? decodeValhallaShape(apiJourney.shape) : base.geometry }; });
    } catch { if (origin.id === originDefault.id && destination.id === destinationDefault.id) next = demoJourneys(); }
    setJourneys(next); setSelectedJourneyId("recommended"); setCalculating(false); setScreen("results");
  };

  const askAssistant = (preset?: string) => {
    const question = (preset ?? assistantInput).trim(); if (!question) return;
    const cheapest = [...journeys].sort((a, b) => a.price - b.price)[0];
    if (/moins cher|budget|économ/i.test(question)) setAssistantAnswer(`Le trajet « ${cheapest.label} » coûte ${cheapest.price.toLocaleString("fr-FR")} FCFA pour environ ${cheapest.duration} minutes.`);
    else if (/incident|trafic|route/i.test(question)) setAssistantAnswer("Un accident est signalé au Pont De Gaulle. SIRA propose une alternative qui respecte votre budget.");
    else setAssistantAnswer(`Je vous recommande l’option à ${selectedJourney.price.toLocaleString("fr-FR")} FCFA : elle combine marche, bus et gbaka avec le meilleur compromis.`);
    setAssistantInput("");
  };

  const selectJourney = (journey: Journey) => { setSelectedJourneyId(journey.id); setScreen("detail"); };

  return <main className="sira-stage"><div className="phone-app">{showSplash ? <Splash /> : <>{screen === "home" && <HomeScreen origin={origin} destination={destination} onOrigin={setOrigin} onDestination={setDestination} onLocate={locateUser} onSearch={calculate} calculating={calculating} onAssistant={() => setAssistantOpen(true)} />}{screen === "results" && <ResultsScreen origin={origin} destination={destination} budget={budget} preference={preference} journeys={journeys} selectedId={selectedJourneyId} onSelect={selectJourney} onBack={() => setScreen("home")} />}{screen === "detail" && selectedJourney && <DetailScreen journey={selectedJourney} destination={destination} onBack={() => setScreen("results")} onStart={() => setScreen("active")} />}{screen === "active" && selectedJourney && <ActiveScreen origin={origin} destination={destination} journey={selectedJourney} onBack={() => setScreen("detail")} notify={notify} />}{screen === "report" && <ReportScreen onBack={() => setScreen("home")} onSubmit={(message) => { notify(message); setScreen("home"); }} />}<BottomNav screen={screen} onChange={setScreen} notify={notify} /></>}{assistantOpen && <AssistantSheet answer={assistantAnswer} value={assistantInput} onValue={setAssistantInput} onAsk={askAssistant} onClose={() => setAssistantOpen(false)} />}{toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}</div></main>;
}
