import { useState, useEffect } from 'react';

// Reactive global session state
let globalIsAuthenticated = false;
let globalHasSeenOnboarding = false;
let authListeners: Array<() => void> = [];

function notifyAuthListeners() {
  authListeners.forEach((listener) => listener());
}

export function setAuthenticated(status: boolean) {
  globalIsAuthenticated = status;
  if (status) {
    globalHasSeenOnboarding = true;
  }
  notifyAuthListeners();
}

export function logoutUser() {
  globalIsAuthenticated = false;
  notifyAuthListeners();
}

export function isUserAuthenticated(): boolean {
  return globalIsAuthenticated;
}

export function hasCompletedOnboarding(): boolean {
  return globalHasSeenOnboarding;
}

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(globalIsAuthenticated);
  const [hasOnboarded, setHasOnboarded] = useState<boolean>(globalHasSeenOnboarding);

  useEffect(() => {
    const handleChange = () => {
      setIsAuthenticated(globalIsAuthenticated);
      setHasOnboarded(globalHasSeenOnboarding);
    };
    authListeners.push(handleChange);
    return () => {
      authListeners = authListeners.filter((l) => l !== handleChange);
    };
  }, []);

  return {
    isAuthenticated,
    hasOnboarded,
    login: () => setAuthenticated(true),
    register: () => setAuthenticated(true),
    logout: logoutUser,
  };
}
