// Map under a fixed centre pin (native): the traveller moves the map, or
// taps a spot to bring it under the pin; the centre is reported when the
// map stops moving.
import React, { useEffect, useRef } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import MapView, { PROVIDER_DEFAULT } from 'react-native-maps';
import type { Coordinates } from '@/lib/sira-api';

export type PinMapProps = {
  initialCenter: Coordinates;
  // Moves the map when `key` changes (e.g. "back to my position").
  focus?: { coordinates: Coordinates; key: number } | null;
  onCenterChange: (center: Coordinates) => void;
  onMoveStart?: () => void;
  style?: ViewStyle;
};

const DELTA = 0.008;

export function PinMap({ initialCenter, focus, onCenterChange, onMoveStart, style }: PinMapProps) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (focus) mapRef.current?.animateToRegion({ ...focus.coordinates, latitudeDelta: DELTA, longitudeDelta: DELTA }, 400);
  }, [focus]);

  return (
    <MapView
      ref={mapRef}
      provider={PROVIDER_DEFAULT}
      style={[StyleSheet.absoluteFill, style]}
      initialRegion={{ ...initialCenter, latitudeDelta: DELTA, longitudeDelta: DELTA }}
      onRegionChange={onMoveStart}
      onRegionChangeComplete={(region) => onCenterChange({ latitude: region.latitude, longitude: region.longitude })}
      onPress={(event) => mapRef.current?.animateToRegion({ ...event.nativeEvent.coordinate, latitudeDelta: DELTA, longitudeDelta: DELTA }, 300)}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
    />
  );
}
