// Community reports shared by the traffic, report and navigation screens:
// live list (Socket.IO + periodic reload), category mapping and the
// anonymous device id used to prevent double votes.
import { useEffect, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { apiBaseUrl, listReports, type TrafficReport } from '@/lib/sira-api';
import type { Ionicons } from '@expo/vector-icons';

// Maquette category ids -> API report types.
export const REPORT_TYPE_BY_CATEGORY: Record<string, string> = {
  accident: 'accident',
  embouteillage: 'traffic',
  route_bloquee: 'blocked',
  inondation: 'flood',
  route_degradee: 'road_damage',
  vehicule_panne: 'breakdown',
  autre: 'other',
};

export const REPORT_STYLE: Record<string, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  accident: { color: '#EF4444', icon: 'car-sport' },
  traffic: { color: '#F97316', icon: 'car' },
  blocked: { color: '#DC2626', icon: 'ban' },
  flood: { color: '#0284C7', icon: 'water' },
  road_damage: { color: '#B45309', icon: 'warning' },
  breakdown: { color: '#7C3AED', icon: 'construct' },
  works: { color: '#CA8A04', icon: 'construct' },
  transport: { color: '#F26522', icon: 'bus' },
  other: { color: '#F26522', icon: 'alert-circle' },
};

export const REPORT_STATUS_LABEL: Record<TrafficReport['status'], string> = {
  reported: 'À confirmer', confirmed: 'Confirmé', reliable: 'Fiable', expired: 'Expiré', resolved: 'Résolu',
};

export function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'À l’instant';
  if (minutes < 60) return `Il y a ${minutes} min`;
  return `Il y a ${Math.round(minutes / 60)} h`;
}

// Anonymous id: persisted in the browser on web, per app launch on native
// (no account yet; it only stops a device from voting twice).
let memoryClientId: string | null = null;
export function clientId() {
  const make = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  if (Platform.OS === 'web') {
    try {
      const stored = window.localStorage.getItem('sira-client-id');
      if (stored) return stored;
      const created = make();
      window.localStorage.setItem('sira-client-id', created);
      return created;
    } catch { /* stockage indisponible */ }
  }
  memoryClientId ??= make();
  return memoryClientId;
}

const ACTIVE: TrafficReport['status'][] = ['reported', 'confirmed', 'reliable'];
let reports: TrafficReport[] = [];
let updatedAt: Date | null = null;
const listeners = new Set<() => void>();
let snapshot: { reports: TrafficReport[]; updatedAt: Date | null } = { reports, updatedAt };
const emit = () => { snapshot = { reports, updatedAt }; listeners.forEach((listener) => listener()); };

export function upsertReport(report: TrafficReport) {
  const rest = reports.filter((item) => item.id !== report.id);
  reports = ACTIVE.includes(report.status) ? [report, ...rest] : rest;
  updatedAt = new Date();
  emit();
}

async function reload() {
  try { reports = await listReports(); updatedAt = new Date(); emit(); } catch { /* hors ligne : on garde la dernière liste */ }
}

let socket: Socket | null = null;
let subscribers = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function connect() {
  const origin = new URL(apiBaseUrl()).origin;
  socket = io(`${origin}/traffic`, { transports: ['websocket', 'polling'], reconnectionAttempts: 5 });
  socket.on('traffic.report.created', upsertReport);
  socket.on('traffic.report.updated', upsertReport);
  socket.on('connect', reload);
  // Expired events are not broadcast: a periodic reload drops them.
  timer = setInterval(reload, 60_000);
  void reload();
}

export function useLiveReports() {
  useEffect(() => {
    subscribers += 1;
    if (subscribers === 1) connect();
    return () => {
      subscribers -= 1;
      if (subscribers === 0) {
        socket?.disconnect(); socket = null;
        if (timer) clearInterval(timer); timer = null;
      }
    };
  }, []);
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => snapshot,
    () => snapshot,
  );
}
