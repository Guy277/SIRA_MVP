export interface OSRMRouteResult {
  distanceText: string;
  durationMinutes: number;
  formattedDuration: string;
  coordinates: { latitude: number; longitude: number }[];
}

export interface LocationCoordinates {
  title: string;
  latitude: number;
  longitude: number;
}

// Known coordinates mapping for key Abidjan places
export const ABIDJAN_COORDINATES_MAP: Record<string, { latitude: number; longitude: number }> = {
  'Orange Digital Center': { latitude: 5.3260, longitude: -4.0198 },
  'Abobo Samaké': { latitude: 5.4160, longitude: -4.0150 },
  'Cocody Saint-Jean': { latitude: 5.3480, longitude: -3.9920 },
  'Yopougon Sipores': { latitude: 5.3450, longitude: -4.0800 },
  'Plateau Cité Administrative': { latitude: 5.3280, longitude: -4.0210 },
  'Adjamé Gare Routière': { latitude: 5.3600, longitude: -4.0250 },
  'Aéroport Int. Félix Houphouët-Boigny': { latitude: 5.2550, longitude: -3.9620 },
  'Marcory Zone 4': { latitude: 5.3050, longitude: -3.9850 },
  'Treichville Gare Bassam': { latitude: 5.3080, longitude: -4.0090 },
  'Riviera 2 Anono': { latitude: 5.3580, longitude: -3.9720 },
  'Ma position actuelle': { latitude: 5.4160, longitude: -4.0150 },
};

/**
 * Fetch a driving route from the public OSRM API
 */
export async function fetchOSRMRoute(
  startLat: number,
  startLon: number,
  destLat: number,
  destLon: number
): Promise<OSRMRouteResult | null> {
  try {
    // Note: OSRM uses longitude,latitude order
    const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${destLon},${destLat}?overview=full&geometries=geojson`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const distanceKm = (route.distance / 1000).toFixed(1);
      const durationMinutes = Math.round(route.duration / 60);

      const coordinates = route.geometry.coordinates.map((point: [number, number]) => ({
        longitude: point[0],
        latitude: point[1],
      }));

      return {
        distanceText: `${distanceKm} Km`,
        durationMinutes,
        formattedDuration: `${durationMinutes} min`,
        coordinates,
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching OSRM route:', error);
    return null;
  }
}

/**
 * Helper to fetch OSRM route using location titles
 */
export async function getRouteBetweenLocations(
  departureName: string,
  arrivalName: string
): Promise<OSRMRouteResult | null> {
  const start = ABIDJAN_COORDINATES_MAP[departureName] || ABIDJAN_COORDINATES_MAP['Abobo Samaké'];
  const dest = ABIDJAN_COORDINATES_MAP[arrivalName] || ABIDJAN_COORDINATES_MAP['Orange Digital Center'];

  return fetchOSRMRoute(start.latitude, start.longitude, dest.latitude, dest.longitude);
}
