// Types partagés par la carte web (osm-map-view.web.tsx) et la carte native (osm-map-view.tsx).

// Un lieu du quotidien sur la carte d'accueil. icon : nom MaterialCommunityIcons ;
// highlighted : pharmacie de garde (marqueur plus grand, bord jaune).
export type MapPlace = { id: string; lat: number; lon: number; color: string; icon: string; label: string; highlighted?: boolean };

// Marge de cadrage, pour que les lieux ne passent pas sous la liste ou la rangée de catégories.
export type MapPadding = { top: number; bottom: number; left: number; right: number };

// Demande de zoom des boutons + / − : delta en niveaux de zoom (+1, −1) ; key change à chaque toucher.
export type ZoomRequest = { delta: number; key: number };
