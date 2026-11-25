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

## 6. L'écran « Ton trajet » en résumé

Vu sur un iPhone le 25 novembre 2026 : jusqu'à 8 lignes par étape, et le même arrêt écrit 3 fois (marcher jusqu'à
lui, l'attendre, y monter). Ce que font les autres (aides officielles, lues le 25 novembre 2026) :
- **Yandex Maps** (famille de Yango) : pour chaque véhicule, le premier et le dernier arrêt ; on touche le nombre
  d'arrêts pour voir la liste complète ([aide](https://yandex.com/support/m-maps/concept/ot.html)).
- **Yango** : le détail d'un trajet s'ouvre par « Details » ([aide](https://maps.yango.com/web-support/en/concept/rout)).
- **Moovit** : la ligne à prendre, le temps d'attente et le nombre d'arrêts d'abord
  ([blog](https://moovit.com/blog/navigating-with-moovit/)).
- **Divulgation progressive** : l'essentiel d'abord, le reste à la demande
  ([NN/g](https://www.nngroup.com/videos/progressive-disclosure/), [IxDF](https://ixdf.org/encyclopedia/progressive_disclosure.html)).
- Pas trouvé de source pour une liste d'arrêts dépliable chez Bonjour RATP ni Google Maps.

Fait le 25 novembre 2026 (`mobile/lib/route-cards.ts`, `mobile/app/route-detail.tsx`) :
1. **Une carte par véhicule** : la ligne, la direction, « Monte à … · ≈ 5 min d'attente » (l'attente avant le
   véhicule est rangée dans sa carte), « Descends à … », le nombre d'arrêts, la durée et le prix.
2. **Marche et changement à pied sur une ligne** : « À pied · 6 min · 468 m », le chemin tourne par tourne au toucher.
3. **Au toucher** : « 9 arrêts ▾ » ouvre la liste complète ; « Plus de détails ▾ » donne les heures de pointe,
   « prépare-toi après … », les autres lignes possibles et les prix donnés par les voyageurs.
4. La pastille « SIRA parle » se met sous la barre du haut sur cet écran (elle cachait « Ton trajet »).
Choix de SIRA (pas de source) : l'ordre des détails, et l'heure de la carte = l'heure d'arrivée à l'arrêt.

## 7. La voix de SIRA pendant le guidage : sous la carte, pas dessus

Vu sur un iPhone le 25 novembre 2026 : la bulle « SIRA VOCAL » et le personnage restaient au milieu de la carte, sur
le chemin juste devant le voyageur, et répétaient le bandeau du haut. Ce que disent les autres (lu le 25 novembre 2026) :
- **Google Maps** : l'instruction en haut, l'heure d'arrivée et la sortie en bas
  ([SDK Navigation](https://developers.google.com/maps/documentation/navigation/ios-sdk/controls)).
- **Waze** : un mode « moins bavard » pour moins distraire
  ([iClarified](https://www.iclarified.com/101447/waze-updates-app-with-less-chatty-navigation-and-new-gemini-ai-features)) ;
  les alertes dans un panneau en bas ([autoevolution](https://www.autoevolution.com/news/google-begins-testing-new-warning-design-in-waze-navigation-app-on-android-142935.html)).
- **Apple CarPlay** : peu de texte, lire distrait ([HIG](https://developer.apple.com/design/human-interface-guidelines/carplay.md)).
- **NHTSA** (indicatif, pour les écrans de voiture) : coups d'œil de 2 s au plus, 12 s en tout
  ([rapport](https://www.nhtsa.gov/sites/nhtsa.gov/files/811781.pdf)).

Fait le 25 novembre 2026 (`mobile/app/navigation-active.tsx`, `stepScreenLine` dans `mobile/lib/journey-format.ts`,
`useLastSpoken` dans `mobile/lib/voice.ts`) :
1. Plus de bulle ni de personnage sur la carte.
2. Ce que dit SIRA s'écrit dans la carte du bas, avec une petite tête ronde, pendant qu'elle parle puis 6 s ;
   la toucher coupe la voix. Pour la phrase d'une étape, seulement ce que le bandeau ne dit pas (« Marche vers le
   sud. », « Direction « Cocody Pâtisserie » ») ; en véhicule rien, le compte à rebours du bandeau le dit déjà.
   Les alertes et réponses s'écrivent telles quelles (3 lignes au plus).
3. Quand SIRA attend « oui » / « non », la ligne le dit.
4. Le badge d'incident n'apparaît que s'il y a un incident confirmé.
Choix de SIRA (pas de source) : les 6 s, la taille de la tête, cacher le badge quand tout va bien.
