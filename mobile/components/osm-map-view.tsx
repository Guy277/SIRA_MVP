import React, { useEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View, ViewStyle, type GestureResponderEvent } from 'react-native';
import { Text } from '@/components/sira-text';
import MapView, {
  Circle,
  Marker,
  Polyline,
  PROVIDER_DEFAULT,
} from 'react-native-maps';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { knownPlace } from '@/lib/places';
import type { Coordinates, TrafficReport } from '@/lib/sira-api';
import {
  altitudeForZoom, headingAlong, metresPerPoint, pointAhead, routeLabels,
  type CenterRequest, type MapDisplayOptions, type MapPadding, type MapPlace, type MapRoute, type ZoomRequest,
} from '@/components/osm-map-types';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

// The traveller's dot pulses: a wave grows out from under it and fades, so it is found at a
// glance (as on the web map). Still for travellers who asked for less motion.
function PulsingUserDot() {
  const reduceMotion = useReducedMotion();
  const wave = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    wave.value = withRepeat(withTiming(1, { duration: 2000, easing: Easing.out(Easing.quad) }), -1, false);
  }, [reduceMotion, wave]);
  const waveStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - wave.value),
    transform: [{ scale: 1 + 2.4 * wave.value }],
  }));
  return (
    <View style={styles.userDotBox}>
      {!reduceMotion && <Animated.View style={[styles.userWave, waveStyle]} />}
      <View style={styles.userMarker} />
    </View>
  );
}

// MapDisplayOptions : boutons de carte de la version web, ignorés ici (react-native-maps) jusqu'au passage à MapLibre.
interface OsmMapViewProps extends MapDisplayOptions {
  departureName?: string;
  arrivalName?: string;
  // Real coordinates win over the name lookup when known.
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

const NO_ROUTES: MapRoute[] = [];

export function OsmMapView({
  departureName,
  arrivalName,
  origin,
  destination,
  routeCoordinates: activeRoute = [],
  alternativeRoutes = NO_ROUTES,
  onRoutePress,
  routeLabel,
  focusCoordinates,
  reports = [],
  onReportPress,
  places = [],
  onPlacePress,
  userPosition,
  padding,
  zoomRequest,
  centerOnUser = false,
  userAccuracyM = null,
  centerRequest = null,
  style,
  showIntermediateStations = false,
  follow = null,
  followPaused = false,
  followCamera = null,
  onFollowPause,
}: OsmMapViewProps) {
  const mapRef = useRef<MapView>(null);
  const { height: screenHeight } = useWindowDimensions();

  // ---- Guidage : la carte suit le voyageur, penchée, la route devant lui (comme la carte web). ----
  const followOn = Boolean(follow);
  const followRef = useRef(followOn);
  const pauseRef = useRef(onFollowPause);
  useEffect(() => { followRef.current = followOn; pauseRef.current = onFollowPause; });
  // Caméra choisie par le voyageur à deux doigts pendant le suivi ; oubliée à une étape d'un autre genre.
  const userCamera = useRef<{ zoom?: number; altitude?: number } | null>(null);
  const cameraKind = followCamera?.kind ?? 'marche';
  useEffect(() => { userCamera.current = null; }, [cameraKind]);
  const lastHeading = useRef(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !follow || followPaused) return;
    const heading = headingAlong(activeRoute, follow) ?? lastHeading.current;
    lastHeading.current = heading;
    const zoom = userCamera.current?.zoom ?? followCamera?.zoom ?? 16.5;
    // Le voyageur dans le bas de l'écran : la caméra vise un point devant lui (un cinquième de l'écran).
    const center = pointAhead(follow, heading, metresPerPoint(zoom, follow.latitude) * screenHeight * 0.2);
    map.animateCamera({
      center, heading, pitch: followCamera?.pitch ?? 55, zoom,
      altitude: userCamera.current?.altitude ?? altitudeForZoom(zoom, follow.latitude, screenHeight),
    }, { duration: 800 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une nouvelle position, un autre trajet ou une autre vue déplace la carte
  }, [follow?.latitude, follow?.longitude, activeRoute, followPaused, followCamera?.kind, followCamera?.zoom, followCamera?.pitch, screenHeight]);

  // Un doigt qui fait glisser la carte met le suivi en pause (l'écran propose « Recentrer ») ; deux doigts zooment
  // et le suivi continue, au zoom choisi. Lu sur les touchers bruts : sur iPhone, onPanDrag de react-native-maps
  // ne marche que si la carte ne défile pas.
  const gesture = useRef<{ x: number; y: number; pinch: boolean; paused: boolean } | null>(null);
  const onTouchStart = (event: GestureResponderEvent) => {
    const { pageX, pageY, touches } = event.nativeEvent;
    gesture.current = { x: pageX, y: pageY, pinch: touches.length > 1, paused: false };
  };
  const onTouchMove = (event: GestureResponderEvent) => {
    const current = gesture.current;
    if (!current || !followRef.current) return;
    const { pageX, pageY, touches } = event.nativeEvent;
    if (touches.length > 1) { current.pinch = true; return; }
    if (!current.pinch && !current.paused && Math.hypot(pageX - current.x, pageY - current.y) > 12) {
      current.paused = true;
      pauseRef.current?.();
    }
  };
  const onTouchEnd = () => {
    const ended = gesture.current;
    gesture.current = null;
    if (!ended?.pinch || !followRef.current) return;
    mapRef.current?.getCamera().then((camera) => { userCamera.current = { zoom: camera.zoom, altitude: camera.altitude }; }).catch(() => {});
  };

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

  // Without coordinates, the name is looked up (own position: the live GPS one, never a fixed point).
  // Bouton « Ma position » : une demande par nouvelle key.
  const centerKey = centerRequest?.key;
  useEffect(() => {
    if (centerKey === undefined || !centerRequest || !mapRef.current) return;
    const { latitude, longitude } = centerRequest.coordinates;
    const delta = centerRequest.wide ? 0.06 : 0.02;
    mapRef.current.animateToRegion({ latitude, longitude, latitudeDelta: delta, longitudeDelta: delta }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seule une nouvelle key recentre
  }, [centerKey]);

  const startCoords = origin ?? (departureName ? knownPlace(departureName) ?? undefined : undefined);
  const endCoords = destination ?? (arrivalName ? knownPlace(arrivalName) ?? undefined : undefined);

  // Fit bounds dynamically when route or markers update. Not during guidance: the following places the map
  // (else every new GPS position would frame the whole trip again).
  const wasFollowing = useRef(false);
  useEffect(() => {
    if (followOn) { wasFollowing.current = true; return; }
    // Leaving the following (« Vue d'ensemble »): the map lies flat again, north up, before framing the trip.
    if (wasFollowing.current) { wasFollowing.current = false; mapRef.current?.setCamera({ pitch: 0, heading: 0 }); }
    if (mapRef.current) {
      if (focusCoordinates && focusCoordinates.length > 1) {
        mapRef.current.fitToCoordinates(focusCoordinates, {
          edgePadding: { top: 70, right: 60, bottom: 70, left: 60 },
          animated: true,
        });
      } else if (activeRoute.length > 0) {
        mapRef.current.fitToCoordinates([...activeRoute, ...alternativeRoutes.flatMap((route) => route.coordinates)], {
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
  }, [activeRoute, alternativeRoutes, focusCoordinates, startCoords, endCoords, places, userPosition, padding, followOn]);

  return (
    <View style={[styles.container, style]} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
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
        {userPosition && userAccuracyM ? (
          <Circle
            center={userPosition}
            radius={userAccuracyM}
            fillColor="rgba(37, 99, 235, 0.12)"
            strokeColor="rgba(37, 99, 235, 0.35)"
            strokeWidth={1.5}
          />
        ) : null}
        {userPosition && (
          <Marker coordinate={userPosition} anchor={{ x: 0.5, y: 0.5 }} title="Ma position" zIndex={0}>
            <PulsingUserDot />
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

        {/* Other journeys in grey, under the chosen one: touching one chooses it */}
        {alternativeRoutes.filter((route) => route.coordinates.length > 1).map((route) => (
          <Polyline
            key={`alternative-${route.id}`}
            coordinates={route.coordinates}
            strokeColor="#7C828C"
            strokeWidth={5}
            tappable={Boolean(onRoutePress)}
            onPress={() => onRoutePress?.(route.id)}
          />
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

        {/* One label per journey drawn, where it parts from the others; touching another one chooses it */}
        {routeLabels(activeRoute, routeLabel, alternativeRoutes).map((label) => (
          <Marker
            key={`label-${label.id ?? 'chosen'}`}
            coordinate={label.point}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={label.chosen ? 4 : 3}
            onPress={() => { if (label.id) onRoutePress?.(label.id); }}
          >
            <View style={[styles.routeLabel, label.chosen && styles.routeLabelChosen]}>
              <Text style={[styles.routeLabelText, label.chosen && styles.routeLabelTextChosen]}>{label.text}</Text>
            </View>
          </Marker>
        ))}
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
  // Room for the wave around the dot (it grows to 3.4 times the dot).
  userDotBox: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userWave: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#2563EB',
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
  routeLabel: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4D4D4',
  },
  routeLabelChosen: {
    backgroundColor: '#F26522',
    borderColor: '#F26522',
  },
  routeLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111111',
  },
  routeLabelTextChosen: {
    color: '#FFFFFF',
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

