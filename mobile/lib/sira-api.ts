// Client of the SIRA back-end (NestJS API + SIRA-MORE). Every screen goes
// through this module; no screen talks to the network on its own.
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { currentToken, expireSession } from '@/lib/session';

export type Coordinates = { latitude: number; longitude: number };
export type CategoryName = 'coule' | 'debout' | 'suspendu';
export type LegMode = 'walk' | 'wait' | 'transfer' | 'sotra' | 'gbaka' | 'woro' | 'taxi' | 'boat';

export type ApiLeg = {
  id: string;
  mode: LegMode;
  label: string;
  detail: string;
  duration: number;
  price: number;
  geometry: [number, number][];
  dataStatus?: string;
  confidence?: number;
  line_id?: string;
  line_code?: string;
  // Other lines serving the same boarding and alighting stops.
  alternatives?: LineAlternative[];
};

export type LineAlternative = { line_id: string; code?: string; name: string; mode: LegMode };

export type ApiJourney = {
  id: string;
  label?: string;
  duration: number;
  duration_p90?: number;
  price: number | null;
  distance_km?: number;
  walking_minutes?: number;
  walking_distance_m?: number;
  waiting_minutes?: number;
  transfer_count?: number;
  comfort?: number;
  modes?: string[];
  legs: ApiLeg[];
  geometry?: [number, number][];
  reasons?: string[];
  categories?: CategoryName[];
  recommended?: boolean;
  data_notice?: string;
};

export type JourneysResponse = {
  journeys: ApiJourney[];
  categories?: Record<CategoryName, string[]>;
  recommended_id?: string | null;
  rejected?: unknown[];
};

export type PlaceResult = { title: string; subtitle: string; coordinates: Coordinates };

export type TrafficReport = {
  id: string; type: string; title: string; description: string | null; location: string;
  lat: number; lon: number; severity: 'low' | 'medium' | 'high';
  status: 'reported' | 'confirmed' | 'reliable' | 'expired' | 'resolved';
  confirmations: number; contests: number; createdAt: string; expiresAt: string;
};

export type ReportImpact = {
  affected: Array<{ report: TrafficReport; distanceM: number; delayMinutes: number; blocking: boolean; legIndex: number }>;
  unconfirmed: Array<{ report: TrafficReport; distanceM: number; delayMinutes: number; blocking: boolean; legIndex: number }>;
  delayMinutes: number;
  blocking: boolean;
  requiresReroute: boolean;
};

// Resolution order: explicit EXPO_PUBLIC_API_URL, then the host serving the
// web bundle, then the development machine Expo Go is connected to (same Wi-Fi).
export function apiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:4000/api/v1`;
  }
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${devHost ?? 'localhost'}:4000/api/v1`;
}

export class SiraApiError extends Error {}

export async function apiJson<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 15_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    const token = currentToken();
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...rest,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...rest.headers },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new SiraApiError('Le serveur SIRA met trop de temps à répondre. Réessayez dans un instant.');
    throw new SiraApiError('Serveur SIRA injoignable. Vérifiez votre connexion.');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    // After 30 days the session ends and the SMS code is asked again.
    if (response.status === 401 && currentToken()) expireSession();
    let message = `La requête SIRA a échoué (${response.status}).`;
    try {
      const payload = await response.json() as { message?: string | string[]; detail?: unknown };
      if (Array.isArray(payload.message)) message = payload.message.join(' ');
      else if (payload.message) message = payload.message;
      else if (typeof payload.detail === 'string') message = payload.detail;
    } catch { /* réponse non JSON */ }
    throw new SiraApiError(message);
  }
  return response.json() as Promise<T>;
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  if (query.trim().length < 3) return [];
  const data = await apiJson<{ features?: Array<{ geometry: { coordinates: [number, number] }; properties: Record<string, string> }> }>(
    `/mobility/search?q=${encodeURIComponent(query.trim())}`, { timeoutMs: 8_000 });
  return (data.features ?? []).map((feature) => ({
    title: feature.properties.name || feature.properties.street || query.trim(),
    subtitle: [feature.properties.district, feature.properties.city].filter(Boolean).join(', ') || 'Abidjan',
    coordinates: { longitude: feature.geometry.coordinates[0], latitude: feature.geometry.coordinates[1] },
  }));
}

export type JourneyQuery = {
  origin: Coordinates & { name: string };
  destination: Coordinates & { name: string };
  departureAt?: Date;
  avoid?: Array<{ lat: number; lon: number; radiusM: number }>;
};

export function fetchJourneys(query: JourneyQuery) {
  return apiJson<JourneysResponse>('/mobility/journeys', {
    method: 'POST',
    timeoutMs: 30_000,
    body: JSON.stringify({
      origin: { lat: query.origin.latitude, lon: query.origin.longitude, name: query.origin.name },
      destination: { lat: query.destination.latitude, lon: query.destination.longitude, name: query.destination.name },
      preference: 'balanced',
      constraints: { maxWalkingDistanceM: 1500, maxTransfers: 3, excludedModes: [] },
      ...(query.departureAt ? { departureAt: query.departureAt.toISOString() } : {}),
      ...(query.avoid?.length ? { avoid: query.avoid } : {}),
    }),
  });
}

export const listReports = () => apiJson<TrafficReport[]>('/reports');
export const createReport = (input: { type: string; lat: number; lon: number; location: string; description?: string; clientId: string }) =>
  apiJson<TrafficReport>('/reports', { method: 'POST', body: JSON.stringify(input) });
export const voteReport = (id: string, kind: 'confirm' | 'contest', clientId: string) =>
  apiJson<TrafficReport>(`/reports/${encodeURIComponent(id)}/${kind}`, { method: 'POST', body: JSON.stringify({ clientId }) });
export const journeyImpact = (legs: ApiLeg[]) =>
  apiJson<ReportImpact>('/reports/impact', { method: 'POST', body: JSON.stringify({ legs: legs.map((leg) => ({ mode: leg.mode, geometry: leg.geometry })) }) });

// Accounts (OTP by SMS) and community fares, served by the community service.
export type OtpRequestResult = { phone_number: string; expires_in_seconds: number; sms_sent: boolean; demo_code: string | null };
export type LoginResult = { access_token: string; is_new_user: boolean; user: { id: string; phone_number: string; full_name: string | null; role: string } };
export type FareSummary = { line_id: string; reports: number; median_fcfa: number | null; agreeing?: number; validated: boolean };

export const requestOtp = (phone: string) =>
  apiJson<OtpRequestResult>('/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone_number: phone }) });
export const verifyOtp = (phone: string, code: string, fullName?: string) =>
  apiJson<LoginResult>('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone_number: phone, code, full_name: fullName }) });
export const updateName = (fullName: string) =>
  apiJson<LoginResult['user']>('/users/me', { method: 'PATCH', body: JSON.stringify({ full_name: fullName }) });
export const fareSummaries = (lineIds: string[]) =>
  apiJson<FareSummary[]>(`/fares?${lineIds.map((id) => `line_id=${encodeURIComponent(id)}`).join('&')}`);
export const reportFare = (lineId: string, mode: LegMode, amount: number) =>
  apiJson<FareSummary>('/fares/reports', { method: 'POST', body: JSON.stringify({ line_id: lineId, mode, amount }) });

export type ReversePlace = { title: string; subtitle: string; kind: 'landmark' | 'street' | 'area'; lat: number; lon: number };
// Nearest landmark (junction, station, bus stop…) or street for a position.
export const reversePlace = (coordinates: Coordinates) =>
  apiJson<ReversePlace>(`/mobility/reverse?lat=${coordinates.latitude}&lon=${coordinates.longitude}`, { timeoutMs: 8_000 });
