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

type State = { search: JourneySearch | null; selectedId: string | null; activeJourney: ApiJourney | null };

let state: State = { search: null, selectedId: null, activeJourney: null };
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
