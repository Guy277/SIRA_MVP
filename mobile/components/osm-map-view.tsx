import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Text } from '@/components/sira-text';
import MapView, {
  Marker,
  Polyline,
  PROVIDER_DEFAULT,
} from 'react-native-maps';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ABIDJAN_COORDINATES_MAP } from '@/services/osrm-service';
import type { Coordinates, TrafficReport } from '@/lib/sira-api';
import type { MapPadding, MapPlace, ZoomRequest } from '@/components/osm-map-types';

interface OsmMapViewProps {
  departureName?: string;
  arrivalName?: string;
  // Real coordinates win over the name lookup when known.
  origin?: Coordinates | null;
  destination?: Coordinates | null;
  routeCoordinates?: { latitude: number; longitude: number }[];
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
  style?: ViewStyle;
  showIntermediateStations?: boolean;
}

// Même couleur que la légende de l'écran Trafic : à confirmer, confirmé, fiable.
const REPORT_STATUS_COLOR: Record<string, string> = { reported: '#F59E0B', confirmed: '#EF4444', reliable: '#991B1B' };

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
  departureName,
  arrivalName,
  origin,
  destination,
  routeCoordinates: activeRoute = [],
  focusCoordinates,
  reports = [],
  onReportPress,
  places = [],
  onPlacePress,
  userPosition,
  padding,
  zoomRequest,
  centerOnUser = false,
  style,
  showIntermediateStations = false,
}: OsmMapViewProps) {
  const mapRef = useRef<MapView>(null);

  // Boutons + / − : une demande de zoom par nouvelle key. Un niveau de zoom = l'écart de la région ×2 ou ÷2.
  const zoomKey = zoomRequest?.key;
  useEffect(() => {
    if (zoomKey === undefined || !zoomRequest || !mapRef.current) return;
    const factor = 2 ** -zoomRequest.delta;
    mapRef.current.getMapBoundaries().then(({ northEast, southWest }) => {
      mapRef.current?.animateToRegion({
        latitude: (northEast.latitude + southWest.latitude) / 2,
        longitude: (northEast.longitude + southWest.longitude) / 2,
        latitudeDelta: Math.min(Math.abs(northEast.latitude - southWest.latitude) * factor, 2),
        longitudeDelta: Math.min(Math.abs(northEast.longitude - southWest.longitude) * factor, 2),
      }, 250);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seule une nouvelle key déclenche un zoom
  }, [zoomKey]);

  // Centré une fois sur le voyageur : ensuite, il déplace la carte librement.
  const centered = useRef(false);
  const userLat = userPosition?.latitude;
  const userLon = userPosition?.longitude;
  useEffect(() => {
    if (!centerOnUser || centered.current || userLat === undefined || userLon === undefined || !mapRef.current) return;
    centered.current = true;
    mapRef.current.animateToRegion({ latitude: userLat, longitude: userLon, latitudeDelta: 0.06, longitudeDelta: 0.06 }, 600);
  }, [centerOnUser, userLat, userLon]);

  const startCoords = origin ?? (departureName ? ABIDJAN_COORDINATES_MAP[departureName] : undefined);
  const endCoords = destination ?? (arrivalName ? ABIDJAN_COORDINATES_MAP[arrivalName] : undefined);

  // Fit bounds dynamically when route or markers update
  useEffect(() => {
    if (mapRef.current) {
      if (focusCoordinates && focusCoordinates.length > 1) {
        mapRef.current.fitToCoordinates(focusCoordinates, {
          edgePadding: { top: 70, right: 60, bottom: 70, left: 60 },
          animated: true,
        });
      } else if (activeRoute.length > 0) {
        mapRef.current.fitToCoordinates(activeRoute, {
          edgePadding: { top: 70, right: 60, bottom: 70, left: 60 },
          animated: true,
        });
      } else if (places.length > 0) {
        mapRef.current.fitToCoordinates(
          [...places.map((place) => ({ latitude: place.lat, longitude: place.lon })), ...(userPosition ? [userPosition] : [])],
          { edgePadding: padding ?? { top: 70, right: 60, bottom: 70, left: 60 }, animated: true },
        );
      } else if (startCoords && endCoords) {
        mapRef.current.fitToCoordinates([startCoords, endCoords], {
          edgePadding: { top: 70, right: 60, bottom: 70, left: 60 },
          animated: true,
        });
      }
    }
  }, [activeRoute, focusCoordinates, startCoords, endCoords, places, userPosition, padding]);

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

        {/* Community reports, Waze style */}
        {reports.map((report) => (
          <Marker
            key={report.id}
            coordinate={{ latitude: report.lat, longitude: report.lon }}
            title={report.title}
            description={`${report.location} · ${report.status === 'reported' ? 'à confirmer' : report.status === 'reliable' ? 'fiable' : 'confirmé'}`}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={2}
            onPress={() => onReportPress?.(report)}
          >
            <View style={[styles.reportMarker, { backgroundColor: REPORT_STATUS_COLOR[report.status] ?? REPORT_STATUS_COLOR.confirmed }]}>
              <Ionicons name="warning" size={12} color="#FFFFFF" />
            </View>
          </Marker>
        ))}

        {/* Traveller's position and everyday places (categories of the home screen) */}
        {userPosition && (
          <Marker coordinate={userPosition} anchor={{ x: 0.5, y: 0.5 }} title="Ma position" zIndex={0}>
            <View style={styles.userMarker} />
          </Marker>
        )}
        {places.map((place) => (
          <Marker
            key={place.id}
            coordinate={{ latitude: place.lat, longitude: place.lon }}
            title={place.label}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={1}
            onPress={() => onPlacePress?.(place.id)}
          >
            <View style={[styles.placeMarker, place.highlighted && styles.placeMarkerGarde, { backgroundColor: place.color }]}>
              <MaterialCommunityIcons name={place.icon as keyof typeof MaterialCommunityIcons.glyphMap} size={place.highlighted ? 19 : 16} color="#FFFFFF" />
            </View>
          </Marker>
        ))}

        {/* Journey computed by the SIRA engine */}
        {activeRoute.length > 1 && (
          <Polyline
            coordinates={activeRoute}
            strokeColor="#F26522"
            strokeWidth={5}
          />
        )}
        {focusCoordinates && focusCoordinates.length > 1 && (
          <Polyline coordinates={focusCoordinates} strokeColor="#1E1E1E" strokeWidth={7} />
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
  reportMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#DC2626',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2563EB',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  placeMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeMarkerGarde: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: '#FACC15',
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

