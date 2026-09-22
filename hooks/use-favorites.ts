import { useState, useEffect } from 'react';

export interface FavoriteRoute {
  id: string;
  departure: string;
  arrival: string;
  title: string;
  mode: string;
  transport: string;
  duration: string;
  costRange: string;
  dateAdded?: string;
}

const DEFAULT_FAVORITES: FavoriteRoute[] = [
  {
    id: 'fav-1',
    departure: 'Abobo Samaké',
    arrival: 'Orange Digital Center',
    title: 'D’Abobo Samaké à Orange Digital Center',
    mode: 'Coulé',
    transport: 'Gbaka',
    duration: '24 min',
    costRange: 'entre 500F et 1.500F',
    dateAdded: 'Ajouté récemment',
  },
];

let globalFavorites: FavoriteRoute[] = [...DEFAULT_FAVORITES];
let listeners: Array<() => void> = [];

export function getFavorites(): FavoriteRoute[] {
  return globalFavorites;
}

export function isFavoriteRoute(titleOrId: string): boolean {
  if (!titleOrId) return false;
  const target = titleOrId.toLowerCase();
  return globalFavorites.some(
    (f) => f.id === titleOrId || f.title.toLowerCase() === target
  );
}

export function addFavoriteRoute(route: Omit<FavoriteRoute, 'id'> & { id?: string }): FavoriteRoute {
  const existing = globalFavorites.find(
    (f) => f.title.toLowerCase() === route.title.toLowerCase()
  );
  if (existing) {
    return existing;
  }
  const newFav: FavoriteRoute = {
    id: route.id || `fav-${Date.now()}`,
    departure: route.departure,
    arrival: route.arrival,
    title: route.title,
    mode: route.mode,
    transport: route.transport,
    duration: route.duration,
    costRange: route.costRange,
    dateAdded: 'Aujourd\'hui',
  };
  globalFavorites = [newFav, ...globalFavorites];
  notifyListeners();
  return newFav;
}

export function removeFavoriteRoute(idOrTitle: string) {
  if (!idOrTitle) return;
  const target = idOrTitle.toLowerCase();
  globalFavorites = globalFavorites.filter(
    (f) => f.id !== idOrTitle && f.title.toLowerCase() !== target
  );
  notifyListeners();
}

export function toggleFavoriteRoute(route: Omit<FavoriteRoute, 'id'> & { id?: string }): boolean {
  const exists = isFavoriteRoute(route.title);
  if (exists) {
    removeFavoriteRoute(route.title);
    return false;
  } else {
    addFavoriteRoute(route);
    return true;
  }
}

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteRoute[]>(globalFavorites);

  useEffect(() => {
    const handleChange = () => {
      setFavorites([...globalFavorites]);
    };
    listeners.push(handleChange);
    return () => {
      listeners = listeners.filter((l) => l !== handleChange);
    };
  }, []);

  return {
    favorites,
    isFavorite: (titleOrId: string) => isFavoriteRoute(titleOrId),
    addFavorite: addFavoriteRoute,
    removeFavorite: removeFavoriteRoute,
    toggleFavorite: toggleFavoriteRoute,
  };
}
