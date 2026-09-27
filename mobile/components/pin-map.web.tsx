// Web version of the pin map, on MapLibre GL + OpenFreeMap like the other
// web maps: move the map or click a spot, the centre is reported on idle.
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { PinMapProps } from './pin-map';

export function PinMap({ initialCenter, focus, onCenterChange, onMoveStart, style }: PinMapProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // Latest callbacks without re-creating the map.
  const handlers = useRef({ onCenterChange, onMoveStart });
  useEffect(() => { handlers.current = { onCenterChange, onMoveStart }; }, [onCenterChange, onMoveStart]);

  useEffect(() => {
    let cancelled = false;
    import('maplibre-gl').then(({ default: maplibregl }) => {
      if (cancelled || !container.current) return;
      const map = new maplibregl.Map({
        container: container.current,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [initialCenter.longitude, initialCenter.latitude],
        zoom: 15.5,
        attributionControl: { compact: true },
      });
      map.on('movestart', () => handlers.current.onMoveStart?.());
      map.on('moveend', () => {
        const { lng, lat } = map.getCenter();
        handlers.current.onCenterChange({ latitude: lat, longitude: lng });
      });
      map.on('click', (event) => map.easeTo({ center: event.lngLat, duration: 300 }));
      mapRef.current = map;
    });
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null; };
    // The map is created once; later centres come through `focus`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (focus) mapRef.current?.easeTo({ center: [focus.coordinates.longitude, focus.coordinates.latitude], zoom: 15.5, duration: 400 });
  }, [focus]);

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
    </View>
  );
}
