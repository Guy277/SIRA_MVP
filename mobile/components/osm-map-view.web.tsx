// Web version of the map: react-native-maps has no web support, so the web
// build uses MapLibre GL with OpenFreeMap tiles, like the SIRA web front.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import type { Map as MapLibreMap, Marker as MapLibreMarker, GeoJSONSource, ExpressionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { knownPlace } from '@/lib/places';
import { MAP_STYLE_URLS, TRANSIT_MODE_COLORS, type MapStyleName } from '@/lib/map-settings';
import { apiBaseUrl, type Coordinates, type TrafficReport } from '@/lib/sira-api';
import { headingAlong, routeLabels, type CenterRequest, type MapDisplayOptions, type MapPlace, type MapPadding, type MapRoute, type ZoomRequest } from '@/components/osm-map-types';

interface OsmMapViewProps extends MapDisplayOptions {
  departureName?: string;
  arrivalName?: string;
  origin?: Coordinates | null;
  destination?: Coordinates | null;
  routeCoordinates?: { latitude: number; longitude: number }[];
  // Other journeys, in grey under the chosen one; the map frames them all.
  alternativeRoutes?: MapRoute[];
  onRoutePress?: (id: string) => void;
  // Label of the chosen journey (« Coulé · 35 min »), shown with the others' labels.
  routeLabel?: string;
  // One step of the journey, touched in its detail: drawn darker, and the map zooms on it.
  focusCoordinates?: Coordinates[] | null;
  reports?: TrafficReport[];
  onReportPress?: (report: TrafficReport) => void;
  // Lieux du quotidien (catégories de l'accueil) et position du voyageur ; la carte se cadre sur eux.
  places?: MapPlace[];
  onPlacePress?: (id: string) => void;
  userPosition?: Coordinates | null;
  padding?: MapPadding;
  // Boutons + / − d'un écran : chaque nouvelle valeur de key zoome de delta niveaux.
  zoomRequest?: ZoomRequest | null;
  // Centrer la carte sur le voyageur dès que sa position est connue (écran Trafic).
  centerOnUser?: boolean;
  // Marge d'erreur de la position du voyageur, en mètres : un cercle bleu pâle autour du point.
  userAccuracyM?: number | null;
  // Bouton « Ma position » : recentre la carte à chaque nouvelle key.
  centerRequest?: CenterRequest | null;
  style?: ViewStyle;
  showIntermediateStations?: boolean;
}

const ABIDJAN_CENTER: [number, number] = [-4.005, 5.365];
// Inclinaison de la vue 3D et du guidage : assez pour voir les bâtiments debout, la route reste lisible.
const TILT = 55;
const FOLLOW_ZOOM = 16.5;
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// Couche « Lignes SIRA » : une couleur par mode, comme sur la fiche Calques.
const TRANSIT_COLOR: ExpressionSpecification = ['match', ['get', 'sira_mode'],
  ...Object.entries(TRANSIT_MODE_COLORS).flat(), '#6B7280'] as unknown as ExpressionSpecification;

// Les 611 lignes allégées (~1 Mo), chargées une seule fois et seulement quand la couche est allumée.
let transitLines: Promise<GeoJSON.FeatureCollection | null> | null = null;
function loadTransitLines() {
  transitLines ??= fetch(`${apiBaseUrl()}/mobility/transport/lines/map`)
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null)
    .then((data) => { if (!data) transitLines = null; return data; });  // échec : on réessaiera
  return transitLines;
}

// Les couches de SIRA, ajoutées au chargement et après chaque changement de fond (setStyle les efface).
function addSiraLayers(map: MapLibreMap, style: MapStyleName) {
  const source = (id: string) => map.addSource(id, { type: 'geojson', data: EMPTY });
  // Bâtiments en relief pour les fonds qui n'en ont pas (Nuit, Épuré) ; « Plan » a déjà sa couche building-3d.
  if (!map.getLayer('building-3d') && map.getSource('openmaptiles')) {
    map.addLayer({ id: 'sira-building-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
      paint: { 'fill-extrusion-color': style === 'nuit' ? '#3A3F47' : '#DADADA', 'fill-extrusion-height': ['get', 'render_height'],
        'fill-extrusion-base': ['get', 'render_min_height'], 'fill-extrusion-opacity': 0.8 } });
  }
  // Les lignes de transport sous tout le reste : le trajet choisi reste au-dessus.
  source('transit');
  map.addLayer({ id: 'transit-line', type: 'line', source: 'transit', layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
    paint: { 'line-color': TRANSIT_COLOR, 'line-opacity': 0.8, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 2.5, 17, 4] } });
  map.addLayer({ id: 'transit-hit', type: 'line', source: 'transit', layout: { visibility: 'none' }, paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 14 } });
  // How far off the traveller's position may be: drawn under the journeys.
  source('accuracy');
  map.addLayer({ id: 'accuracy-fill', type: 'fill', source: 'accuracy', paint: { 'fill-color': '#2563EB', 'fill-opacity': 0.12 } });
  map.addLayer({ id: 'accuracy-line', type: 'line', source: 'accuracy', paint: { 'line-color': '#2563EB', 'line-opacity': 0.35, 'line-width': 1.5 } });
  // Other journeys first, so the chosen one is drawn over them; a wide invisible line makes them easy to touch.
  source('alternatives');
  map.addLayer({ id: 'alternatives-line', type: 'line', source: 'alternatives', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#7C828C', 'line-width': 5 } });
  map.addLayer({ id: 'alternatives-hit', type: 'line', source: 'alternatives', paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 18 } });
  source('journey');
  map.addLayer({ id: 'journey-line', type: 'line', source: 'journey', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#F26522', 'line-width': 5 } });
  source('focus');
  map.addLayer({ id: 'focus-line', type: 'line', source: 'focus', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1E1E1E', 'line-width': 7 } });
}

// A circle of radiusM metres around a point, as a ring of [lon, lat] (flat earth: fine for a few km).
function circleRing(center: Coordinates, radiusM: number) {
  const latStep = radiusM / 111_320;
  const lonStep = radiusM / (111_320 * Math.cos((center.latitude * Math.PI) / 180));
  return Array.from({ length: 65 }, (_, index) => {
    const angle = (index / 64) * 2 * Math.PI;
    return [center.longitude + lonStep * Math.cos(angle), center.latitude + latStep * Math.sin(angle)];
  });
}

function markerElement(className: string, text = '') {
  const node = document.createElement('div');
  node.className = className;
  node.textContent = text;
  return node;
}

// Icône MaterialCommunityIcons dessinée avec la police déjà chargée par l'appli.
const glyph = (name: string) => {
  const code = (MaterialCommunityIcons.glyphMap as Record<string, number>)[name];
  return code ? String.fromCodePoint(code) : '';
};

const NO_ROUTES: MapRoute[] = [];

export function OsmMapView({ departureName, arrivalName, origin, destination, routeCoordinates = [], alternativeRoutes = NO_ROUTES, onRoutePress, routeLabel, focusCoordinates, reports = [], onReportPress, places = [], onPlacePress, userPosition, padding, zoomRequest, centerOnUser = false, userAccuracyM = null, centerRequest = null, style, mapStyle = 'plan', tilted = false, showTransitLines = false, showBuildings = true, onBearingChange, northRequest = null, follow = null, followPaused = false, followCamera = null, onFollowPause }: OsmMapViewProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<MapLibreMarker[]>([]);
  const [ready, setReady] = useState(false);
  // Changes with each new map background: the effects that fill SIRA's layers run again.
  const [styleVersion, setStyleVersion] = useState(0);
  // The map's handlers are set once: they read the latest callbacks here.
  const routePress = useRef(onRoutePress);
  const bearingChange = useRef(onBearingChange);
  const followPause = useRef(onFollowPause);
  const following = useRef(Boolean(follow));
  useEffect(() => { routePress.current = onRoutePress; bearingChange.current = onBearingChange; followPause.current = onFollowPause; following.current = Boolean(follow); });
  // Zoom choisi par le voyageur à deux doigts (ou à la molette) pendant le suivi ; oublié à l'étape d'un autre genre
  // (de la marche au véhicule…), qui a sa propre vue.
  const userZoom = useRef<number | null>(null);
  const cameraKind = followCamera?.kind ?? 'marche';
  useEffect(() => { userZoom.current = null; }, [cameraKind]);
  const shownStyle = useRef(mapStyle);
  const followOn = Boolean(follow);
  const tiltedNow = useRef(tilted);
  useEffect(() => { tiltedNow.current = tilted; });

  // Without coordinates, the name is looked up (own position: the live GPS one, never a fixed point).
  const start = origin ?? (departureName ? knownPlace(departureName) ?? undefined : undefined);
  const end = destination ?? (arrivalName ? knownPlace(arrivalName) ?? undefined : undefined);

  useEffect(() => {
    let cancelled = false;
    import('maplibre-gl').then(({ default: maplibregl }) => {
      if (cancelled || !container.current) return;
      const map = new maplibregl.Map({ container: container.current, style: MAP_STYLE_URLS[shownStyle.current], center: ABIDJAN_CENTER, zoom: 11.5, attributionControl: { compact: true } });
      // The map credits start folded (the « i » opens them): unfolded, they cover the bottom of a phone screen.
      map.once('load', () => map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
      map.on('load', () => {
        addSiraLayers(map, shownStyle.current);
        // Layer handlers stay on the map: they work again after each new background.
        map.on('click', 'alternatives-hit', (event) => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === 'string') routePress.current?.(id);
        });
        map.on('mouseenter', 'alternatives-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'alternatives-hit', () => { map.getCanvas().style.cursor = ''; });
        // A line of the « Lignes SIRA » layer, touched: its name (« bus 06 : Aéroport ↔ Gare Sud »).
        map.on('click', 'transit-hit', (event) => {
          const name = event.features?.[0]?.properties?.name;
          if (name) new maplibregl.Popup({ closeButton: false, className: 'sira-map-line-popup' }).setLngLat(event.lngLat).setText(String(name)).addTo(map);
        });
        // The compass shows while the map is turned: told every few degrees, and at the end of each turn.
        let told = 0;
        const tell = (always: boolean) => {
          const bearing = map.getBearing();
          if (always || Math.abs(bearing - told) >= 3) { told = bearing; bearingChange.current?.(bearing); }
        };
        map.on('rotate', () => tell(false));
        map.on('rotateend', () => tell(true));
        // Moving the map with one finger (or the mouse) during guidance pauses the following; the map stays
        // tilted where the traveller put it. Two fingers zoom: the following goes on, at the zoom chosen.
        map.on('dragstart', (event) => {
          const touches = (event.originalEvent as TouchEvent | undefined)?.touches?.length ?? 0;
          if (following.current && touches < 2) followPause.current?.();
        });
        map.on('zoomend', (event) => {
          if (following.current && event.originalEvent) userZoom.current = Math.min(19, Math.max(13, map.getZoom()));
        });
        mapRef.current = map;
        setReady(true);
      });
    });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  // Fond choisi dans Calques (Plan, Nuit, Épuré) : le nouveau fond efface les couches de SIRA, on les remet.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || shownStyle.current === mapStyle) return;
    shownStyle.current = mapStyle;
    map.once('style.load', () => { addSiraLayers(map, mapStyle); setStyleVersion((version) => version + 1); });
    map.setStyle(MAP_STYLE_URLS[mapStyle], { diff: false });
  }, [ready, mapStyle]);

  // The map frames the journeys once per new set of points, not after a change of background.
  const framed = useRef('');
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let active = true;
    import('maplibre-gl').then(({ default: maplibregl }) => {
      if (!active) return;
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      const add = (coordinates: Coordinates, element: HTMLElement) => markers.current.push(new maplibregl.Marker({ element }).setLngLat([coordinates.longitude, coordinates.latitude]).addTo(map));
      if (start) add(start, markerElement('sira-map-start'));
      if (end) add(end, markerElement('sira-map-end'));
      // Le voyageur d'abord : incidents et lieux se dessinent par-dessus et restent faciles à toucher.
      if (userPosition) add(userPosition, markerElement('sira-map-user'));
      reports.forEach((report) => {
        // Même couleur que la légende de l'écran Trafic : à confirmer, confirmé, fiable.
        const node = markerElement(`sira-map-report sira-map-report--${report.status}`, '!');
        node.title = `${report.title} — ${report.location}`;
        if (onReportPress) { node.style.cursor = 'pointer'; node.addEventListener('click', () => onReportPress(report)); }
        add({ latitude: report.lat, longitude: report.lon }, node);
      });
      // One label per journey drawn, where it parts from the others; the chosen one on top.
      routeLabels(routeCoordinates, routeLabel, alternativeRoutes).forEach((label) => {
        const node = markerElement(`sira-map-route-label${label.chosen ? ' sira-map-route-label--chosen' : ''}`, label.text);
        node.style.zIndex = label.chosen ? '2' : '1';
        const id = label.id;
        if (id) {
          node.setAttribute('role', 'button');
          node.setAttribute('aria-label', `Choisir le trajet ${label.text}`);
          node.addEventListener('click', () => routePress.current?.(id));
        }
        markers.current.push(new maplibregl.Marker({ element: node, anchor: 'bottom' }).setLngLat([label.point.longitude, label.point.latitude]).addTo(map));
      });
      places.forEach((place) => {
        const node = markerElement(`sira-map-place${place.highlighted ? ' sira-map-place--garde' : ''}`, glyph(place.icon));
        node.style.background = place.color;
        node.title = place.label;
        node.setAttribute('role', 'button');
        node.setAttribute('aria-label', place.label);
        if (onPlacePress) { node.style.cursor = 'pointer'; node.addEventListener('click', () => onPlacePress(place.id)); }
        add({ latitude: place.lat, longitude: place.lon }, node);
      });

      (map.getSource('journey') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: routeCoordinates.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: routeCoordinates.map((point) => [point.longitude, point.latitude]) } }] : [],
      });
      (map.getSource('accuracy') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: userPosition && userAccuracyM ? [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circleRing(userPosition, userAccuracyM)] } }] : [],
      });
      const drawnAlternatives = alternativeRoutes.filter((route) => route.coordinates.length > 1);
      (map.getSource('alternatives') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: drawnAlternatives.map((route) => ({ type: 'Feature', properties: { id: route.id }, geometry: { type: 'LineString', coordinates: route.coordinates.map((point) => [point.longitude, point.latitude]) } })),
      });
      const focus = focusCoordinates && focusCoordinates.length > 1 ? focusCoordinates : null;
      (map.getSource('focus') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: focus ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: focus.map((point) => [point.longitude, point.latitude]) } }] : [],
      });
      // Guidage : c'est le suivi qui place la carte.
      if (following.current) { framed.current = 'suivi'; return; }
      const placePoints = places.length ? [...places.map((place) => ({ latitude: place.lat, longitude: place.lon })), ...(userPosition ? [userPosition] : [])] : [];
      const routePoints = [...routeCoordinates, ...drawnAlternatives.flatMap((route) => route.coordinates)];
      const points = focus ?? (routePoints.length ? routePoints : placePoints.length ? placePoints : [start, end].filter((point): point is Coordinates => Boolean(point)));
      const key = points.length ? `${points.length}:${points[0].latitude},${points[0].longitude}:${points[points.length - 1].latitude},${points[points.length - 1].longitude}` : '';
      if (key === framed.current) return;
      framed.current = key;
      if (points.length >= 2) {
        const lons = points.map((point) => point.longitude); const lats = points.map((point) => point.latitude);
        // Cadré à plat (nord en haut), ou penché si le voyageur a choisi la 3D : un seul mouvement, que rien n'interrompt.
        const camera = map.cameraForBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: padding ?? 50, maxZoom: 16 });
        if (camera) map.easeTo({ ...camera, pitch: tiltedNow.current ? TILT : 0, bearing: tiltedNow.current ? map.getBearing() : 0, duration: 600 });
      } else if (points.length === 1 && placePoints.length) {
        // Un seul lieu (fiche sans position du voyageur) : centré dessus. Les autres écrans à un seul point
        // (signalement, localisation) gardent leur cadrage ; une marge absente ne doit pas être transmise,
        // MapLibre lirait padding.top sur undefined.
        map.easeTo({ center: [points[0].longitude, points[0].latitude], zoom: 15, duration: 600, ...(padding ? { padding } : {}) });
      }
    });
    return () => { active = false; };
  }, [ready, styleVersion, followOn, start?.latitude, start?.longitude, end?.latitude, end?.longitude, routeCoordinates, alternativeRoutes, routeLabel, focusCoordinates, reports, onReportPress, places, onPlacePress, userPosition?.latitude, userPosition?.longitude, userAccuracyM, padding]);

  // Couche « Lignes SIRA » : chargée au premier allumage, puis seulement montrée ou cachée.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    ['transit-line', 'transit-hit'].forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', showTransitLines ? 'visible' : 'none'); });
    if (!showTransitLines) return;
    let active = true;
    void loadTransitLines().then((data) => { if (active && data) (map.getSource('transit') as GeoJSONSource | undefined)?.setData(data); });
    return () => { active = false; };
  }, [ready, showTransitLines, styleVersion]);

  // Bâtiments : ceux de « Plan » restent visibles à plat ; ceux qu'on ajoute aux autres fonds, seulement en 3D.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (map.getLayer('building-3d')) map.setLayoutProperty('building-3d', 'visibility', showBuildings ? 'visible' : 'none');
    if (map.getLayer('sira-building-3d')) map.setLayoutProperty('sira-building-3d', 'visibility', showBuildings && (tilted || followOn) ? 'visible' : 'none');
  }, [ready, showBuildings, tilted, followOn, styleVersion]);

  // Bouton 2D / 3D : la carte se penche ; en 2D elle revient à plat, nord en haut. Le guidage a sa propre vue.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || followOn) return;
    map.easeTo(tilted ? { pitch: TILT, duration: 600 } : { pitch: 0, bearing: 0, duration: 600 });
  }, [ready, tilted, followOn]);

  // Guidage : la carte suit le voyageur, penchée, la route montant devant lui. En pause, elle ne bouge plus ;
  // à la reprise (« Recentrer » ou retour automatique), elle revient sur lui.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !follow || followPaused) return;
    const heading = headingAlong(routeCoordinates, follow);
    map.easeTo({ center: [follow.longitude, follow.latitude], zoom: userZoom.current ?? followCamera?.zoom ?? FOLLOW_ZOOM,
      pitch: followCamera?.pitch ?? TILT, bearing: heading ?? map.getBearing(), offset: [0, 120], duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une nouvelle position, un autre trajet ou une autre vue déplace la carte
  }, [ready, follow?.latitude, follow?.longitude, routeCoordinates, followPaused, followCamera?.kind, followCamera?.zoom, followCamera?.pitch]);

  // Boussole : une demande par nouvelle key.
  const northKey = northRequest?.key;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || northKey === undefined) return;
    map.easeTo({ bearing: 0, duration: 400 });
  }, [ready, northKey]);

  // Bouton « Ma position » : une demande par nouvelle key.
  const centerKey = centerRequest?.key;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || centerKey === undefined || !centerRequest) return;
    map.easeTo({ center: [centerRequest.coordinates.longitude, centerRequest.coordinates.latitude], zoom: centerRequest.wide ? 13.5 : Math.max(map.getZoom(), 15), duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seule une nouvelle key recentre
  }, [ready, centerKey]);

  // Boutons + / − : une demande de zoom par nouvelle key (zoomRequest change de key à chaque toucher).
  const zoomKey = zoomRequest?.key;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || zoomKey === undefined || !zoomRequest) return;
    map.easeTo({ zoom: map.getZoom() + zoomRequest.delta, duration: 250 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seule une nouvelle key déclenche un zoom
  }, [ready, zoomKey]);

  // Centré une fois sur le voyageur : ensuite, il déplace la carte librement.
  const centered = useRef(false);
  const userLat = userPosition?.latitude;
  const userLon = userPosition?.longitude;
  useEffect(() => {
    const map = mapRef.current;
    if (!centerOnUser || !map || !ready || centered.current || userLat === undefined || userLon === undefined) return;
    centered.current = true;
    map.easeTo({ center: [userLon, userLat], zoom: 13.5, duration: 600 });
  }, [centerOnUser, ready, userLat, userLon]);

  return (
    <View style={[styles.container, style]}>
      <style>{MARKER_CSS}</style>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
    </View>
  );
}

const MARKER_CSS = `
.sira-map-start { width: 18px; height: 18px; border-radius: 50%; background: #22C55E; border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
.sira-map-end { width: 20px; height: 20px; border-radius: 50%; background: #F26522; border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
.sira-map-report { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: #DC2626; border: 2px solid #fff; font: 800 12px system-ui; }
.sira-map-report--reported { background: #F59E0B; }
.sira-map-report--confirmed { background: #EF4444; }
.sira-map-report--reliable { background: #991B1B; }
.sira-map-route-label { padding: 3px 8px; border-radius: 12px; background: #fff; color: #111; border: 1px solid #D4D4D4; box-shadow: 0 1px 4px rgba(0,0,0,.25); font: 700 11px system-ui; white-space: nowrap; cursor: pointer; }
.sira-map-route-label--chosen { background: #F26522; color: #fff; border-color: #F26522; cursor: default; }
.sira-map-user { width: 16px; height: 16px; border-radius: 50%; background: #2563EB; border: 3px solid #fff; box-shadow: 0 0 0 6px rgba(37,99,235,.2); animation: sira-map-user-pulse 2s ease-out infinite; }
/* The traveller's dot pulses: a wave grows out of its halo and fades, so it is found at a glance.
   Drawn as a shadow, it stays under the dot. Not for travellers who asked for less motion. */
@keyframes sira-map-user-pulse {
  0% { box-shadow: 0 0 0 6px rgba(37,99,235,.2), 0 0 0 0 rgba(37,99,235,.45); }
  100% { box-shadow: 0 0 0 6px rgba(37,99,235,.2), 0 0 0 22px rgba(37,99,235,0); }
}
@media (prefers-reduced-motion: reduce) { .sira-map-user { animation: none; } }
.sira-map-place { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; color: #fff; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.3); font: 17px 'material-community'; }
.sira-map-place--garde { width: 36px; height: 36px; font-size: 20px; border: 3px solid #FACC15; }
.sira-map-line-popup .maplibregl-popup-content { padding: 6px 10px; border-radius: 10px; font: 600 12px system-ui; color: #111; }
`;

export default OsmMapView;

const styles = StyleSheet.create({ container: { flex: 1, overflow: 'hidden', backgroundColor: '#EAEAEA', position: 'relative' } });
