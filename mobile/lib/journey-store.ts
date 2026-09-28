// Shared state for the current search: results, the chosen journey and the
// journey being followed. Screens subscribe with useJourneyStore().
import { useSyncExternalStore } from 'react';
import type { ApiJourney, CategoryName, Coordinates } from '@/lib/sira-api';

export type JourneySearch = {
  departure: { name: string } & Coordinates;
  arrival: { name: string } & Coordinates;
  departureAt: Date;
  journeys: ApiJourney[];
  categories: Record<CategoryName, string[]>;
};

// The trip just finished: the home screen offers the way back and says goodbye once.
export type FinishedTrip = { from: { name: string } & Coordinates; to: { name: string } & Coordinates; at: number; greeted: boolean };

type State = { search: JourneySearch | null; selectedId: string | null; activeJourney: ApiJourney | null; finished: FinishedTrip | null };

let state: State = { search: null, selectedId: null, activeJourney: null, finished: null };
const listeners = new Set<() => void>();

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export const journeyStore = {
  setSearch: (search: JourneySearch) => set({ search, selectedId: null }),
  select: (selectedId: string) => set({ selectedId }),
  start: (journey: ApiJourney) => set({ activeJourney: journey }),
  // A rerouted journey replaces the followed one and joins the results.
  replaceActive: (journey: ApiJourney) => set({
    activeJourney: journey,
    selectedId: journey.id,
    search: state.search ? { ...state.search, journeys: [journey, ...state.search.journeys] } : state.search,
  }),
  // Arrived: the journey is no longer followed nor chosen (the chat stops talking about it).
  finish: () => set({
    activeJourney: null,
    selectedId: null,
    finished: state.search ? { from: state.search.departure, to: state.search.arrival, at: Date.now(), greeted: false } : state.finished,
  }),
  // Guidance left before arriving.
  stop: () => set({ activeJourney: null }),
  markFinishedGreeted: () => { if (state.finished) set({ finished: { ...state.finished, greeted: true } }); },
  get: () => state,
};

export function useJourneyStore() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => state,
    () => state,
  );
}

export function selectedJourney(current: State = state) {
  return current.search?.journeys.find((journey) => journey.id === current.selectedId) ?? null;
}
