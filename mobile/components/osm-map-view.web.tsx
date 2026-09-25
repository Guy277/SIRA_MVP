// Web version of the map: react-native-maps has no web support, so the web
// build uses MapLibre GL with OpenFreeMap tiles, like the SIRA web front.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import type { Map as MapLibreMap, Marker as MapLibreMarker, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ABIDJAN_COORDINATES_MAP } from '@/services/osrm-service';
import type { Coordinates, TrafficReport } from '@/lib/sira-api';

interface OsmMapViewProps {
  departureName?: string;
  arrivalName?: string;
  origin?: Coordinates | null;
  destination?: Coordinates | null;
  routeCoordinates?: { latitude: number; longitude: number }[];
  reports?: TrafficReport[];
  onReportPress?: (report: TrafficReport) => void;
  style?: ViewStyle;
  showIntermediateStations?: boolean;
}

const ABIDJAN_CENTER: [number, number] = [-4.005, 5.365];

function markerElement(className: string, text = '') {
  const node = document.createElement('div');
  node.className = className;
  node.textContent = text;
  return node;
}

export function OsmMapView({ departureName, arrivalName, origin, destination, routeCoordinates = [], reports = [], onReportPress, style }: OsmMapViewProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markers = useRef<MapLibreMarker[]>([]);
  const [ready, setReady] = useState(false);

  const start = origin ?? (departureName ? ABIDJAN_COORDINATES_MAP[departureName] : undefined);
  const end = destination ?? (arrivalName ? ABIDJAN_COORDINATES_MAP[arrivalName] : undefined);

  useEffect(() => {
    let cancelled = false;
    import('maplibre-gl').then(({ default: maplibregl }) => {
      if (cancelled || !container.current) return;
      const map = new maplibregl.Map({ container: container.current, style: 'https://tiles.openfreemap.org/styles/liberty', center: ABIDJAN_CENTER, zoom: 11.5, attributionControl: { compact: true } });
      map.on('load', () => {
        map.addSource('journey', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'journey-line', type: 'line', source: 'journey', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#F26522', 'line-width': 5 } });
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
      reports.forEach((report) => {
        const node = markerElement(`sira-map-report${report.status === 'reported' ? ' sira-map-report--pending' : ''}`, '!');
        node.title = `${report.title} — ${report.location}`;
        if (onReportPress) { node.style.cursor = 'pointer'; node.addEventListener('click', () => onReportPress(report)); }
        add({ latitude: report.lat, longitude: report.lon }, node);
      });

      (map.getSource('journey') as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: routeCoordinates.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: routeCoordinates.map((point) => [point.longitude, point.latitude]) } }] : [],
      });
      const points = routeCoordinates.length ? routeCoordinates : [start, end].filter((point): point is Coordinates => Boolean(point));
      if (points.length >= 2) {
        const lons = points.map((point) => point.longitude); const lats = points.map((point) => point.latitude);
        map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 50, duration: 600, maxZoom: 15 });
      }
    });
    return () => { active = false; };
  }, [ready, start?.latitude, start?.longitude, end?.latitude, end?.longitude, routeCoordinates, reports, onReportPress]);

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
.sira-map-report--pending { opacity: .6; }
`;

export default OsmMapView;

const styles = StyleSheet.create({ container: { flex: 1, overflow: 'hidden', backgroundColor: '#EAEAEA', position: 'relative' } });
