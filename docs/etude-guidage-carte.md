# Étude de l'existant : la carte pendant le guidage

Étude faite le 22 novembre 2026 pour préparer le « lot 2 » du guidage de SIRA (une vue adaptée à chaque étape).
Méthode : recherche web, puis lecture des pages officielles citées. **Je n'ai testé aucune de ces applis** :
tout vient de leur documentation ou de leurs annonces, souvent promotionnelles, parfois anciennes (dates données).
Chaque point dit s'il est **vérifié** (lu dans la source citée) ou **non vérifié**.

## 1. Ce que disent les sources

### Google Maps, kit de navigation (documentation développeurs)
Source : [Navigation SDK iOS, « Adjust the camera »](https://developers.google.com/maps/documentation/navigation/ios-sdk/camera)
et [Navigation SDK Android, « Adjust the camera »](https://developers.google.com/maps/documentation/navigation/android-sdk/camera).
C'est le kit que Google fournit aux autres applis ; il donne une idée fidèle des règles de Google Maps, sans
garantir que l'appli grand public fait exactement pareil.

| Point | Ce que dit la source | Statut |
| --- | --- | --- |
| Vue par défaut | Mode « suivi » : caméra derrière la position, inclinée à **45°**, tournée dans le sens du déplacement (iOS) ; « perspective inclinée » sur Android, sans angle chiffré | vérifié |
| Déplacer la carte | iOS : déplacer **ou zoomer** pendant le guidage fait passer en mode « libre », caméra immobile | vérifié (iOS) ; non dit pour Android |
| Bouton « Recentrer » | Caché pendant le suivi, visible en mode libre et en vue d'ensemble ; il remet le suivi | vérifié |
| Retour automatique | iOS : la caméra ne revient que si on appuie sur « Recentrer » ; on **peut** ajouter un minuteur. L'exemple de code recentre après **5 secondes**, sans le recommander comme réglage | vérifié |
| Vue d'ensemble | Tout le trajet (iOS) ou le trajet restant, jusqu'à 45 min de conduite (Android), cadré à l'écran | vérifié |

### Google Maps, guidage en transports en commun
Source : [blog Google, 14 décembre 2017](https://www.blog.google/products/maps/never-miss-your-stop-again-step-step-directions-transit-navigation/) (Android).
- Bouton « Démarrer », suivi de la progression, horaires et heure d'arrivée : **vérifié**.
- Une notification dit quand changer ou descendre : **vérifié**. À combien d'arrêts avant : **non dit**.
- Ce que fait la carte pendant ce guidage : **non dit**. Article ancien : l'appli actuelle peut différer.

### Citymapper (mode GO)
Source : [« GO, Your Personal Trip Assistant »](https://content.citymapper.com/news/517/go-your-personal-trip-assistant) (date non indiquée).
- Le trajet est découpé en étapes ; l'appli montre l'étape la plus utile au moment présent : **vérifié**.
- Une notification reste sur l'écran verrouillé pendant tout le trajet et sait à quelle étape on est : **vérifié**.
- Une alerte « Time to get off » (il est temps de descendre) : **vérifié** ; à combien d'arrêts avant : **non dit**.
- Le comportement de la carte : **non dit**.

### Transit (mode GO)
Source : [aide Transit, « How to use GO »](https://help.transitapp.com/article/549-how-to-use-go), mise à jour le 15 septembre 2026.
- Étapes annoncées : « Go in … minutes », « Hurry up! », puis un **compte à rebours d'arrêts**
  (« 5…4…3…2..more stops », « Get off in 2 stops »), « Your stop is next! », « This is your stop! » : **vérifié**.
- GO détecte si l'on marche ou si l'on est dans un véhicule : **vérifié**.
- Annonces vocales possibles (option « seulement avec des écouteurs ») ; le téléphone ne se réveille que quand il
  faut agir : **vérifié**.
- Le comportement de la carte : **non dit** (la page décrit l'écran verrouillé, pas la carte).

### Moovit
Source : [blog Moovit, « Navigating with Moovit », 21 janvier 2026](https://moovit.com/blog/navigating-with-moovit/).
- Guide étape par étape (quand marcher, quelle station, quel bus), suivi en temps réel : **vérifié**.
- Alerte « Get Off » à l'approche de l'arrêt : **vérifié** ; à quelle distance : **non dit**.
- Le comportement de la carte : **non dit**.

### Autres applis
Pour celles-ci, je n'ai lu que les extraits donnés par la recherche web, pas les pages entières.
- **Waze** : je t'avais dit que Waze revient tout seul sur ta position après quelques secondes. **Non vérifié** :
  aucune source officielle trouvée. Je retire cette affirmation.
- **Bonjour RATP** : alertes de perturbations sur ses lignes ([article Bonjour RATP](https://www.bonjour-ratp.fr/actualites/articles/fonctionnalite-alertes-trafic/)) ;
  une alerte « descends à ton arrêt » : **non trouvée**.
- **Plans d'Apple** : itinéraires en transports avec « Go » ([guide de l'iPhone](https://support.apple.com/en-gw/guide/iphone/ipha44f57caa/ios)) ;
  une alerte pour descendre : **non trouvée** dans le guide.
- **Yango Maps** : un bouton « 3D » qui penche la carte, et « 2D » pour revenir à plat
  ([aide Yango Maps](https://maps.yango.com/web-support/en/concept/map-control)) : **vérifié**. Rien sur les transports en commun.

### À Abidjan
La recherche n'a trouvé **aucune trace de Moovit à Abidjan**. Deux applis locales sont citées dans la presse,
sans que j'aie lu leurs pages en détail : **AMUGA mon trajet**, présentée par l'Autorité de la mobilité urbaine
dans le Grand Abidjan en mars 2022 ([Fraternité Matin](https://www.fratmat.info/article/219417/economie/ministegravere-des-transports/transport-en-commun-le-ministere-lance-une-application-pour-moderniser-le-secteur)),
et **Moja Ride**, qui veut numériser gbaka et wôrô-wôrô ([africa.com](https://africa.com/ivory-coast-transport-start-up-moja-ride-partners-with-o-city-by-bpc/)).
Ce sont des concurrents directs de SIRA : **à regarder de près, non vérifié ici**.

## 2. Ce qu'on en retient

1. **Pour la marche, le modèle est Google** : carte penchée, caméra derrière toi, tournée dans ton sens, « Recentrer »
   quand on a bougé la carte. C'est ce que fait le lot 1.
2. **Pour les transports en commun, les applis ne misent pas sur la carte** : aucune des sources ne décrit la
   carte pendant le trajet en bus. Elles misent sur **l'étape en cours**, **le nombre d'arrêts restants** et
   **l'alerte pour descendre** (vibration, voix, écran verrouillé).
3. **Le compte à rebours d'arrêts (Transit)** est l'idée la plus concrète à reprendre, mais à Abidjan beaucoup
   d'arrêts de gbaka et de wôrô-wôrô sont informels : il faudra parfois compter en mètres ou en minutes plutôt
   qu'en arrêts.

## 3. Écarts entre le lot 1 et ces sources (à trancher)

| Point | Google (kit de navigation) | SIRA, lot 1 | Ma recommandation |
| --- | --- | --- | --- |
| Zoomer pendant le suivi | passe en mode libre | le suivi continue au zoom choisi | garder SIRA : on zoome souvent pour lire un nom de rue en marchant ; à confirmer à l'usage |
| Retour automatique | seulement avec « Recentrer » ; minuteur possible, 5 s dans l'exemple | 8 s | essayer sur le terrain ; passer à 5 s si 8 s paraît long |
| Inclinaison | 45° | 55° | garder 55° pour la marche (plus de rue visible devant) ; 45° en véhicule (lot 2) |

## 4. Proposition pour le lot 2, à partir de l'étude

1. **Bandeau du haut selon l'étape**, comme Transit : à pied « Marche 3 min jusqu'à… » ; en véhicule
   « Descends dans 3 arrêts », puis « Ton arrêt est le prochain », puis « C'est ton arrêt ». Quand les arrêts ne
   sont pas connus (gbaka, wôrô-wôrô), « Descends dans 800 m » ou « dans 4 min ».
2. **Alerte pour descendre** : vibration et voix au bon moment (SIRA a déjà « Descends bientôt »). Pas d'écran
   verrouillé ni d'îlot dynamique en version web : réservé à l'appli installée (lot 3).
3. **Carte selon l'étape** (choix de design SIRA, les sources ne disent rien pour les transports) : à pied, proche
   et penchée (55°) ; à l'arrêt, centrée sur l'arrêt (45°) ; en véhicule, un peu plus loin (50°), de plus en plus
   proche à l'approche de l'arrêt de descente.
   Fait le 22 novembre 2026 (`mobile/lib/ride-progress-core.ts`). Essai dans le navigateur : vouloir garder l'arrêt
   de descente à l'écran sur un long trajet faisait reculer la carte jusqu'à perdre la 3D. La carte reste donc assez
   proche pour la 3D (zoom 15 au plus loin), et c'est le bandeau qui donne les arrêts restants.
4. **Avant d'aller plus loin, regarder AMUGA mon trajet et Moja Ride**, les deux applis locales.

## 5. Lot 3 : l'appli installée (iPhone, Android)

Fait le 22 novembre 2026 (`mobile/components/osm-map-view.tsx`, react-native-maps) : même suivi penché que sur le
web, « Recentrer », retour automatique, vue d'ensemble à plat, vue selon l'étape.
- Sur iPhone, l'événement « glisser » de react-native-maps ne marche que si la carte ne défile pas : le glissement
  est donc lu sur les touchers (un doigt qui bouge de plus de 12 points = pause ; deux doigts = zoom).
- Plans d'Apple règle la caméra par une altitude en mètres : convertie depuis le zoom par une approximation
  (angle de vue de 30°, `altitudeForZoom`). **Non vérifié sur un iPhone** : la carte peut paraître trop proche ou
  trop loin, à régler à l'essai.
