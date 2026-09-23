import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, ViewStyle, Text } from 'react-native';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_DEFAULT,
} from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import {
  ABIDJAN_COORDINATES_MAP,
  getRouteBetweenLocations,
} from '@/services/osrm-service';

interface OsmMapViewProps {
  departureName?: string;
  arrivalName?: string;
  routeCoordinates?: { latitude: number; longitude: number }[];
  style?: ViewStyle;
  showIntermediateStations?: boolean;
}

// Default Abidjan initial region
const ABIDJAN_REGION = {
  latitude: 5.365,
  longitude: -4.005,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

// Intermediate stations for Abidjan route breakdown
const INTERMEDIATE_STATIONS = [
  { name: "Gare d'Adjamé", latitude: 5.3600, longitude: -4.0250 },
  { name: "Rond-Point de la Riviera", latitude: 5.3580, longitude: -3.9720 },
  { name: "Cocody Riviera 3", latitude: 5.3480, longitude: -3.9650 },
];

export function OsmMapView({
  departureName = 'Abobo Terminus',
  arrivalName = 'Orange Digital Center',
  routeCoordinates: externalRoute = [],
  style,
  showIntermediateStations = true,
}: OsmMapViewProps) {
  const mapRef = useRef<MapView>(null);
  const [fetchedRoute, setFetchedRoute] = useState<{ latitude: number; longitude: number }[]>([]);

  const startCoords =
    ABIDJAN_COORDINATES_MAP[departureName] ||
    ABIDJAN_COORDINATES_MAP['Abobo Samaké'] ||
    { latitude: 5.4160, longitude: -4.0150 };

  const endCoords =
    ABIDJAN_COORDINATES_MAP[arrivalName] ||
    ABIDJAN_COORDINATES_MAP['Orange Digital Center'] ||
    { latitude: 5.3260, longitude: -4.0198 };

  // Fetch real OSRM driving route if external coordinates are not provided
  useEffect(() => {
    let isMounted = true;

    if (externalRoute.length === 0) {
      getRouteBetweenLocations(departureName, arrivalName).then((result) => {
        if (isMounted && result && result.coordinates.length > 0) {
          setFetchedRoute(result.coordinates);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [departureName, arrivalName, externalRoute]);

  const activeRoute = externalRoute.length > 0 ? externalRoute : fetchedRoute;

  // Fit bounds dynamically when route or markers update
  useEffect(() => {
    if (mapRef.current) {
      if (activeRoute.length > 0) {
        mapRef.current.fitToCoordinates(activeRoute, {
          edgePadding: { top: 70, right: 60, bottom: 70, left: 60 },
          animated: true,
        });
      } else if (startCoords && endCoords) {
        mapRef.current.fitToCoordinates([startCoords, endCoords], {
          edgePadding: { top: 70, right: 60, bottom: 70, left: 60 },
          animated: true,
        });
      }
    }
  }, [activeRoute, departureName, arrivalName]);

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_DEFAULT}
        style={styles.map}
        initialRegion={ABIDJAN_REGION}
        showsUserLocation={false}
        showsCompass={false}
        showsBuildings={true}
        showsIndoors={false}
      >
        {/* Departure Marker */}
        {startCoords && (
          <Marker coordinate={startCoords} title={departureName} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.startMarkerBadge}>
              <View style={styles.startMarkerInnerDot} />
            </View>
          </Marker>
        )}

        {/* Intermediate Stations Markers */}
        {showIntermediateStations &&
          INTERMEDIATE_STATIONS.map((station, idx) => (
            <Marker
              key={`station-${idx}`}
              coordinate={{ latitude: station.latitude, longitude: station.longitude }}
              title={station.name}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              <View style={styles.stationMarkerCircle}>
                <Ionicons name="bus" size={10} color="#FFFFFF" />
              </View>
            </Marker>
          ))}

        {/* Arrival Marker */}
        {endCoords && (
          <Marker coordinate={endCoords} title={arrivalName} anchor={{ x: 0.5, y: 1 }}>
            <View style={styles.endMarkerBadge}>
              <Ionicons name="location" size={26} color="#F26522" />
            </View>
          </Marker>
        )}

        {/* OSRM Route Polyline */}
        {activeRoute.length > 0 ? (
          <Polyline
            coordinates={activeRoute}
            strokeColor="#F26522"
            strokeWidth={5}
            lineDashPattern={undefined}
          />
        ) : (
          <Polyline
            coordinates={[
              startCoords,
              INTERMEDIATE_STATIONS[0],
              INTERMEDIATE_STATIONS[1],
              INTERMEDIATE_STATIONS[2],
              endCoords,
            ]}
            strokeColor="#F26522"
            strokeWidth={4}
          />
        )}
      </MapView>

      {/* Map Badge */}
      <View style={styles.osmBadge}>
        <Text style={styles.osmBadgeText}>Carte Abidjan SIRA GPS</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EAEAEA',
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  startMarkerBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(34, 197, 94, 0.25)',
    borderWidth: 2,
    borderColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  startMarkerInnerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  stationMarkerCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  endMarkerBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  osmBadge: {
    position: 'absolute',
    bottom: 6,
    right: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    zIndex: 10,
  },
  osmBadgeText: {
    fontSize: 9.5,
    color: '#333333',
    fontWeight: '700',
  },
});

