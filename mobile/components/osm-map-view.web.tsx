// Web version of the map: react-native-maps has no web support, so the web
// build uses MapLibre GL with OpenFreeMap tiles, like the SIRA web front.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import type { Map as MapLibreMap, Marker as MapLibreMarker, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { knownPlace } from '@/lib/places';
import type { Coordinates, TrafficReport } from '@/lib/sira-api';
import { routeLabels, type CenterRequest, type MapPlace, type MapPadding, type MapRoute, type ZoomRequest } from '@/components/osm-map-types';

interface OsmMapViewProps {
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

export function OsmMapView({ departureName, arrivalName, origin, destination, routeCoordinates = [], alternativeRoutes = NO_ROUTES, onRoutePress, routeLabel, focusCoordinates, reports = [], onReportPress, places = [], onPlacePress, userPosition, padding, zoomRequest, centerOnUser = false, userAccuracyM = null, centerRequest = null, style }: OsmMapViewProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<MapLibreMarker[]>([]);
  const [ready, setReady] = useState(false);
  // The map's click handler is set once: it reads the latest callback here.
  const routePress = useRef(onRoutePress);
  useEffect(() => { routePress.current = onRoutePress; }, [onRoutePress]);

  // Without coordinates, the name is looked up (own position: the live GPS one, never a fixed point).
  const start = origin ?? (departureName ? knownPlace(departureName) ?? undefined : undefined);
  const end = destination ?? (arrivalName ? knownPlace(arrivalName) ?? undefined : undefined);

  useEffect(() => {
    let cancelled = false;
    import('maplibre-gl').then(({ default: maplibregl }) => {
      if (cancelled || !container.current) return;
      const map = new maplibregl.Map({ container: container.current, style: 'https://tiles.openfreemap.org/styles/liberty', center: ABIDJAN_CENTER, zoom: 11.5, attributionControl: { compact: true } });
      // The map credits start folded (the « i » opens them): unfolded, they cover the bottom of a phone screen.
      map.once('load', () => map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
      map.on('load', () => {
        // How far off the traveller's position may be: drawn first, under everything else.
        map.addSource('accuracy', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'accuracy-fill', type: 'fill', source: 'accuracy', paint: { 'fill-color': '#2563EB', 'fill-opacity': 0.12 } });
        map.addLayer({ id: 'accuracy-line', type: 'line', source: 'accuracy', paint: { 'line-color': '#2563EB', 'line-opacity': 0.35, 'line-width': 1.5 } });
        // Other journeys first, so the chosen one is drawn over them; a wide invisible line makes them easy to touch.
        map.addSource('alternatives', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'alternatives-line', type: 'line', source: 'alternatives', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#7C828C', 'line-width': 5 } });
        map.addLayer({ id: 'alternatives-hit', type: 'line', source: 'alternatives', paint: { 'line-color': '#000000', 'line-opacity': 0, 'line-width': 18 } });
        map.on('click', 'alternatives-hit', (event) => {
          const id = event.features?.[0]?.properties?.id;
          if (typeof id === 'string') routePress.current?.(id);
        });
        map.on('mouseenter', 'alternatives-hit', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'alternatives-hit', () => { map.getCanvas().style.cursor = ''; });
        map.addSource('journey', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'journey-line', type: 'line', source: 'journey', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#F26522', 'line-width': 5 } });
        map.addSource('focus', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'focus-line', type: 'line', source: 'focus', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1E1E1E', 'line-width': 7 } });
        mapRef.current = map;
        setReady(true);
      });
    });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
  }, []);

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
      const placePoints = places.length ? [...places.map((place) => ({ latitude: place.lat, longitude: place.lon })), ...(userPosition ? [userPosition] : [])] : [];
      const routePoints = [...routeCoordinates, ...drawnAlternatives.flatMap((route) => route.coordinates)];
      const points = focus ?? (routePoints.length ? routePoints : placePoints.length ? placePoints : [start, end].filter((point): point is Coordinates => Boolean(point)));
      if (points.length >= 2) {
        const lons = points.map((point) => point.longitude); const lats = points.map((point) => point.latitude);
        map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: padding ?? 50, duration: 600, maxZoom: 16 });
      } else if (points.length === 1 && placePoints.length) {
        // Un seul lieu (fiche sans position du voyageur) : centré dessus. Les autres écrans à un seul point
        // (signalement, localisation) gardent leur cadrage ; une marge absente ne doit pas être transmise,
        // MapLibre lirait padding.top sur undefined.
        map.easeTo({ center: [points[0].longitude, points[0].latitude], zoom: 15, duration: 600, ...(padding ? { padding } : {}) });
      }
    });
    return () => { active = false; };
  }, [ready, start?.latitude, start?.longitude, end?.latitude, end?.longitude, routeCoordinates, alternativeRoutes, routeLabel, focusCoordinates, reports, onReportPress, places, onPlacePress, userPosition?.latitude, userPosition?.longitude, userAccuracyM, padding]);

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
`;

export default OsmMapView;

const styles = StyleSheet.create({ container: { flex: 1, overflow: 'hidden', backgroundColor: '#EAEAEA', position: 'relative' } });
