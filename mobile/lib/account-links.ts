// The traveller's own pages, the same in the side menu and on the Profil screen. One list, so
// the two never drift apart again (the same page was « Historique » in one, « Mes trajets » in the
// other). Trafic and Signaler stay out: they are in the bottom bar, always in sight.
// Each screen adds what belongs only to it: « Partager SIRA » in the menu, « Supprimer mon
// compte » on the Profil (a serious step, kept out of a quick menu); both end with « Se déconnecter ».
import type { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';

export type AccountLink = { id: string; title: string; icon: keyof typeof Ionicons.glyphMap; href: Href };

// Groups, shown in this order with a separator between them.
export const ACCOUNT_LINKS: AccountLink[][] = [
  [
    { id: 'trips', title: 'Mes trajets', icon: 'time', href: '/history' },
    { id: 'favorites', title: 'Mes favoris', icon: 'heart', href: '/favorites' },
    { id: 'places', title: 'Mes lieux', icon: 'bookmark', href: '/my-places' },
    // Also the star beside « On va où ? » on the home screen.
    { id: 'chat', title: 'Discuter avec SIRA', icon: 'sparkles', href: '/chat' },
  ],
  [
    { id: 'settings', title: 'Paramètres', icon: 'settings-outline', href: '/settings' },
    // The « Informations » screen: what SIRA is, and its version.
    { id: 'about', title: 'À propos de SIRA', icon: 'information-circle-outline', href: '/info-settings' },
  ],
];
