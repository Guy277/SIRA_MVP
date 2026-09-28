// Safari and Chrome give the microphone and the position only in HTTPS or on
// localhost: opened at http://<IP of the PC>:8081 from a phone, they are not
// refused by the traveller, they are unavailable. SIRA says so, instead of
// « refusé » and a detour through the settings that would change nothing.
import { Platform } from 'react-native';

export const needsSecureContext = () =>
  Platform.OS === 'web' && typeof window !== 'undefined' && window.isSecureContext === false;

export const MIC_NEEDS_HTTPS = 'Le micro nécessite une connexion sécurisée (HTTPS). Écris ta destination ou choisis-la sur la carte.';
export const POSITION_NEEDS_HTTPS = 'La position nécessite une connexion sécurisée (HTTPS). Écris ta destination ou choisis-la sur la carte.';
