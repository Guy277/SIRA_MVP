# Réseau de transport : extraction OpenStreetMap

Généré par `npm run data:osm` (scripts/build-transport-osm.mjs) à partir d'OpenStreetMap du **2026-10-20**.
Données © contributeurs OpenStreetMap, licence ODbL. Les lignes de transport informel ajoutées en 2022-2023 ont été
relevées sur le terrain et saisies directement dans OSM (changesets #DataTransport #Ewarren, source « survey »).

## Par rapport au réseau de 2021

| | 2021 | Aujourd'hui |
|---|---|---|
| Lignes | 398 | **611** |
| Arrêts | 3820 | **6497** |

- **215 lignes nouvelles**, **2 disparues**, **201** dont la liste d'arrêts a changé.
- 145 noms de ligne réécrits (surtout de la mise en forme : « Aéroport ↔ Gare Sud » → « bus 06 : Aéroport ↔ Gare Sud »).
- **Tarifs** : 609 lignes avec un tarif OSM (balise `charge`), 0 repris de 2021, 2 inconnus.
  Lignes déjà présentes en 2021 : 117 tarifs identiques, 279 ajoutés (elles n'en avaient pas), 0 changés.
- **Horaires de passage** : durée OSM (`duration`) pour 1232 sens ; 23 estimés à 15 km/h sur la distance.
- 0 sens sans arrêts dans OSM sont ignorés.

## Méthodes (rien d'inventé)

- Lignes = relations `route_master`, sens = relations `route`, arrêts = membres `platform` (`stop` s'il y a moins de 2 quais).
- Durée (`duration`) et intervalle (`interval`) lus en minutes, `HH:MM` ou `HH:MM:SS`.
- Tarif : `charge` OSM, sinon tarif de 2021 de la même relation, sinon inconnu.
- Fréquence : `interval` OSM, sinon celle de 2021 de la même relation, sinon aucune.
- Tracés pour le calcul de trajet simplifiés à 10 m (Douglas-Peucker) ; le GTFS garde les tracés complets.

## Mettre SIRA à jour avec cette extraction

Le réseau de 2021 se garde une fois dans `data/processed/2021/` (référence de comparaison). Puis, depuis la racine :

```bash
npm run data:osm
node scripts/normalize-transport-data.mjs --input data/osm-2026/abidjantransport_lignes.geojson --source "OpenStreetMap (Overpass), lignes du Grand Abidjan" --date 2026-10-20 --license "ODbL (© contributeurs OpenStreetMap)"
node scripts/import-transport-postgis.mjs --gtfs data/osm-2026/abidjan-osm.zip --lines data/osm-2026/abidjantransport_lignes.csv --source-date 2026-10-20 --license "ODbL (© contributeurs OpenStreetMap)"
```

Relire ensuite `services/voice/knowledge/reseau.md` (nombre de lignes, gares de bateau-bus).

## Lignes disparues

- woro woro : Rivera 2 station ↔ CIAD Eden (WORO_WORO, relation r11543885)
- woro woro : Riviera 2 Station ↔ Sol Béni (WORO_WORO, relation r13537312)

## Lignes nouvelles, par réseau

### Woro-woro Banalisé (85)

- woro woro banalisé : 2 Plateaux Mobil ↔ Koumassi Bacongo
- woro woro banalisé : 2 Plateaux Mobil ↔ Mosquée du Plateau
- woro woro banalisé : 2 Plateaux Mobil ↔ Plateau Sorbonne
- woro woro banalisé : 2 Plateaux Mobil ↔ Plateau Telecel
- woro woro banalisé : 2 Plateaux Mobil ↔ Treichville Gare de Bassam
- woro woro banalisé : 2 Plateaux Mobil ↔ Yopougon 2è Pont
- woro woro banalisé : 9 kilo ↔ Plateau Mosquée
- woro woro banalisé : 9 kilo ↔ Plateau St Paul
- woro woro banalisé : 9 kilo ↔ Port Bouet
- woro woro banalisé : 9 kilo ↔ Yopougon 1er Pont
- woro woro banalisé : 9 kilo ↔ Yopougon 2è Pont
- woro woro banalisé : 9kilo ↔ Plateau Telecel/Mosquée
- woro woro banalisé : Abobo St Joseph ↔ Cocody Pâtisserie
- woro woro banalisé : Abobo St Joseph ↔ Koumassi Bacongo
- woro woro banalisé : Abobo St Joseph ↔ Koumassi Grand Carrefour
- woro woro banalisé : Abobo St Joseph ↔ Plateau St Paul
- woro woro banalisé : Abobo St Joseph ↔ Port-Bouët
- woro woro banalisé : Abobo St Joseph ↔ Treichville Gare Bassam
- woro woro banalisé : Anono ↔ CHU de Treichville
- woro woro banalisé : Anono ↔ Koumassi
- woro woro banalisé : Carrefour Angre ↔ Koumassi Grand Carrefour
- woro woro banalisé : Carrefour Angre ↔ Treichville
- woro woro banalisé : Carrefour Angré ↔ Bacongo
- woro woro banalisé : Carrefour Angré ↔ Plateau St Paul
- woro woro banalisé : Cocody La vie ↔ Koumassi Bacongo
- woro woro banalisé : Cocody La vie ↔ Marcory Station
- woro woro banalisé : Cocody La vie ↔ Plateau Longchamp
- woro woro banalisé : Cocody La vie ↔ Plateau Pyramide/Mosquée
- woro woro banalisé : Cocody La vie ↔ Plateau Telecel/Mosquée
- woro woro banalisé : Cocody La vie ↔ Port Bouet
- woro woro banalisé : Cocody La vie ↔ Treichville Gare Bassam
- woro woro banalisé : Cocody Patisserie ↔ Plateau Longchamp
- woro woro banalisé : Cocody Patisserie ↔ Plateau Pyramide/Mosquée
- woro woro banalisé : Cocody Patisserie ↔ Plateau Telecel/Mosquée
- woro woro banalisé : Djeni Kobenan ↔ Koumassi
- woro woro banalisé : Djeni Kobenan ↔ Marcory Marché
- woro woro banalisé : Djeni Kobenan ↔ Plateau Super U
- woro woro banalisé : Djeni Kobenan ↔ Treichville Gare Bassam
- woro woro banalisé : Inades ↔ Adjamé INHP
- woro woro banalisé : Inades ↔ Adjamé Renault
- woro woro banalisé : Koumassi Bacongo ↔ Yopougon Lavage
- woro woro banalisé : Liberté ↔ Koumassi
- woro woro banalisé : Liberté ↔ Marcory Konankro
- woro woro banalisé : Liberté ↔ Marcory Marché
- woro woro banalisé : Mairie d'Adjamé ↔ Blockhauss
- woro woro banalisé : Mairie d'Adjamé ↔ Cocody 2 Plateaux
- woro woro banalisé : Mairie d'Adjamé ↔ Cocody Pâtisserie
- woro woro banalisé : Mairie d'Adjamé ↔ Koumassi Bacongo
- woro woro banalisé : Mairie d'Adjamé ↔ Marcory Marché
- woro woro banalisé : Mairie d'Adjamé ↔ Plateau Gare Sud
- woro woro banalisé : Mairie d'Adjamé ↔ Plateau Longchamp
- woro woro banalisé : Mairie d'Adjamé ↔ Plateau Mosquée
- woro woro banalisé : Mairie d'Adjamé ↔ Plateau Super U
- woro woro banalisé : Mairie d'Adjamé ↔ Treichville Gare Bassam
- woro woro banalisé : Palmeraie ↔ Koumassi Grand Carrefour
- woro woro banalisé : Palmeraie ↔ Marcory
- woro woro banalisé : Palmeraie ↔ Plateau Telecel/Mosquée
- woro woro banalisé : Palmeraie ↔ Plateau par Longchamp
- woro woro banalisé : Palmeraie ↔ Plateau par Pyramide/Mosquée
- woro woro banalisé : Palmeraie ↔ Port Bouet
- woro woro banalisé : Palmeraie ↔ Treichville
- woro woro banalisé : Plateau Longchamp ↔ Port Bouet
- woro woro banalisé : Plateau Longchamp ↔ Treichville Gare Bassam
- woro woro banalisé : Renault ↔ 2 Plateaux Mobile
- woro woro banalisé : Renault ↔ CHU de Cocody
- woro woro banalisé : Renault ↔ Cocody Pâtisserie
- woro woro banalisé : Renault ↔ Koumassi Bacongo
- woro woro banalisé : Renault ↔ Marcory Marché
- woro woro banalisé : Renault ↔ Plateau Super U
- woro woro banalisé : Renault ↔ Treichville Gare Bassam
- woro woro banalisé : Rivera 2 ↔ Koumassi Bacongo
- woro woro banalisé : Riviera 2 ↔ Marcory
- woro woro banalisé : Riviera 2 ↔ Plateau Longchamp
- woro woro banalisé : Riviera 2 ↔ Plateau Pyramide/Mosquée
- woro woro banalisé : Riviera 2 ↔ Plateau Telecel/Mosquée
- woro woro banalisé : Riviera 2 ↔ Port Bouet
- woro woro banalisé : Riviera 2 ↔ Treichville Gare Bassam
- woro woro banalisé : Treichville ↔ Yopougon
- woro woro banalisé : Yopougon 1er pont ↔ 2 Plateaux Mobil
- woro woro banalisé : Yopougon Lavage ↔ Cocody Pâtisserie
- woro woro banalisé : Yopougon Lavage ↔ Marcory
- woro woro banalisé : Yopougon Lavage ↔ Plateau Super U
- woro woro banalisé : Yopougon ↔ Palmeraie
- woro woro banalisé : Yopougon ↔ Port Bouet
- woro woro banalisé : Yopougon ↔ Rivera 2

### Woro-woro de Cocody (41)

- Terminus 81 <-> Palmeraie après barrage
- woro woro : 2 Plateaux Mobil ↔ Petro Ivoire
- woro woro : 9 kilo ↔ Ecole libanaise
- woro woro : 9 kilo ↔ M'Pouto
- woro woro : Abobo Azur Mobil ↔ Belle Côte- Palmeraie
- woro woro : Abobo Azur Mobil ↔ Cocovico
- woro woro : Abobo Azur Mobil ↔ Mary'se - Palmeraie
- woro woro : Abobo Azur Mobil ↔ St Marc- Palmeraie
- woro woro : Angré 22ème ↔ Riviera 2 - Gare annexe
- woro woro : Angré Château ↔ Hôtel Ivoire
- woro woro : Angré Château ↔ Mary'se - Palmeraie
- woro woro : Angré Château ↔ St Marc- Palmeraie
- woro woro : Angré Château ↔ Terminus 82
- woro woro : Angré Petro Ivoire ↔ Angré Château
- woro woro : Angré Petro Ivoire ↔ CHU Angré
- woro woro : Angré Petro Ivoire ↔ Palmeraie Warren/commissariat par la CNPS
- woro woro : Angré Petro Ivoire ↔ Palmeraie par le CHU Angré
- woro woro : Bonoumin ↔ Mary'se
- woro woro : Bonoumin ↔ Mary'se - Rond point ADO
- woro woro : Carrefour Angre ↔ CHU Angre
- woro woro : Carrefour Angre ↔ La vie
- woro woro : Carrefour Angre ↔ Marché Cocovico
- woro woro : Carrefour Angré ↔ Deux plateaux Mobile
- woro woro : Carrefour Angré ↔ Palmeraie Station
- woro woro : Carrefour Angré ↔ St Jean
- woro woro : Faya ↔ Akouedo basket
- woro woro : Mahou ↔ Angré Petro Ivoire
- woro woro : Nouveau goudron Abatta ↔ Angre fin goudron
- woro woro : Nouveau goudron Abatta ↔ Cité Sir
- woro woro : Nouveau goudron Abatta ↔ Cité prestige
- woro woro : Nouveau goudron Abatta ↔ Nouveau CHU
- woro woro : Nouveau goudron ↔ Abatta village
- woro woro : Palmeraie DGI ↔ Akouedo village
- woro woro : Palmeraie Station ↔ CHU Angré
- woro woro : Petro Ivoire ↔ Belle côte - Warren/commissariat
- woro woro : Riviera 2 Station ↔ DC10
- woro woro : Riviera 2 Station ↔ STL
- woro woro : Shell Petro Ivoire ↔ En bas
- woro woro : Terminus 81-82 ↔ Riviera 2 - Gare annexe
- woro woro : Warren/commissariat ↔ Enica
- woro woro : Warren/commissariat ↔ St Viateur

### Gbaka d'Adjamé (19)

- gbaka : Adjamé Agban ↔ Koweit
- gbaka : Adjamé Agban ↔ Mairie d'Abobo
- gbaka : Adjamé Agban ↔ Mossikro
- gbaka : Adjamé en Haut ↔ Abatta
- gbaka : Bracodi ↔ Abobo Gare
- gbaka : Bracodi ↔ Académie
- gbaka : Bracodi ↔ Agripac
- gbaka : Bracodi ↔ Palais
- gbaka : Bracodi ↔ Terminus 27
- gbaka : Djeni Kobenan ↔ 9 Kilo
- gbaka : Djeni Kobenan ↔ Maroc Antenne
- gbaka : Djeni Kobenan ↔ Palais
- gbaka : Liberté ↔ Ecole de Police
- gbaka : Liberté ↔ Palmeraie
- gbaka : Liberté ↔ Rivera 2
- gbaka : Renault ↔ Bingerville Nouvelle Gare
- gbaka : Texaco ↔ Koweit
- gbaka : Texaco ↔ Mossikro
- gbaka : Yopougon Palais ↔ Adjamé Mosquée

### Woro-woro de Yopougon (10)

- woro woro : Gabriel Gare ↔ Abobo Doumé
- woro woro : Keneya ↔ Petro Ivoire
- woro woro : Marché Bagnon ↔ Fin Goudron
- woro woro : Marché Bagnon ↔ Lokoua
- woro woro : Marché Bagnon ↔ Terminus 27
- woro woro : Palais ↔ Académie
- woro woro : Palais ↔ Beago Village
- woro woro : Palais ↔ Marché Bagnon
- woro woro : Sable ↔ Jean-Paul 2
- woro woro : Terminus 27 ↔ Azito

### Woro-woro de Bingerville (7)

- woro woro : Coopec ↔ Achokoi
- woro woro : Coopec ↔ Adjin
- woro woro : Nouvelle gare ↔ Brégbo
- woro woro : Nouvelle gare ↔ Delacelle
- woro woro : Nouvelle gare ↔ M'batto Bouaké
- woro woro : Nouvelle gare ↔ Sodepalme
- woro-woro : Nouvelle gare ↔ Eloka

### Woro-woro de Koumassi (7)

- woro woro : Gelti ↔ Abattoir
- woro woro : Gelti ↔ Anoumabo Sans fil
- woro woro : Gelti ↔ Marché de Port-Bouët
- woro woro : Soweto ↔ Bacongo
- woro woro : Soweto ↔ CIE
- woro woro : Soweto ↔ Gelti
- woro woro : Soweto ↔ Remblais

### Gbaka d'Attécoubé (6)

- gbaka : Attécoubé Garage ↔ Boissy
- gbaka : Attécoubé Garage ↔ Camp Militaire
- gbaka : Attécoubé Garage ↔ Gesco Rond Point
- gbaka : Attécoubé Garage ↔ Koweit
- gbaka : Attécoubé Garage ↔ Locodjro
- gbaka : Attécoubé Garage ↔ Mossikro

### Woro-woro d'Abobo (5)

- woro woro : Après les Rails ↔ Bocabo
- woro woro : Gare d'Abobo ↔ Abobo Baoule
- woro woro : Gare d'Abobo ↔ Belle Ville
- woro woro : Gendarmerie ↔ Cité policère
- woro woro : Gendarmerie ↔ Marché Avocatier

### Gbaka d'Abobo (5)

- gbaka : Gendarmerie ↔ Gare Anyama
- gbaka : Samake ↔ Carrefour N'dotré
- gbaka : Samake ↔ Pk 18 ancien marché
- gbaka : Samake ↔ Yopougon Siporex
- gkaka : Gare d'Abobo ↔ Gare Djibi

### Woro-woro de Treichville (5)

- woro woro : Marché de Belleville ↔ Gare Marcory
- woro woro : Marché de Treichville ↔ Marché de Belleville
- woro woro : Marché de Treichville ↔ Station Total
- woro woro : Treichville Gare Bassam ↔ Mairie de Treichville
- woro woro : Treichville Gare Bassam ↔ STL

### Woro-woro d'Attécoubé (5)

- woro woro : Gare Mosquée ↔ Carrefour Garage
- woro woro : Gare Mosquée ↔ Gare Attécoubé
- woro woro : Gare Nord en Haut ↔ Boribana
- woro woro : Gare Nord en Haut ↔ Gare Attécoubé
- woro woro : Locodjro ↔ Mossikro

### Gbaka de Yopougon (5)

- gbaka : Sable ↔ Bingerville
- gbaka : Sable ↔ Gesco Gendarmerie
- gbaka : Sable ↔ Gesco Rond Point
- gbaka : Siporex ↔ Terminus 27
- gbaka : Yopougon Siporex ↔ Koweit

### Woro-woro d'Anyama (3)

- woro woro : Gare Routière ↔ Grand Carrefour
- woro woro : Gare Routière ↔ Hopital
- woro woro : Gare Routière ↔ Séminaire

### Woro-woro d'Adjamé (3)

- woro woro : Adjamé Liberté ↔ Williamsville Macaci
- woro woro : Mairie d'Adjamé ↔ Adjamé Mosquée
- woro woro : Saint Michel ↔ Williamsville Macaci

### Gbaka de Bingerville (2)

- gbaka : Escallier ↔ Bingerville Agban
- gbaka : Escallier ↔ Brégbo

### Woro-woro de Bassam (2)

- woro woro : Gare Rond Point ↔ Rond Point Moossou
- woro woro : Petit Paris ↔ Moossou

### Gbaka de Cocody (1)

- gbaka : 9 kilo ↔ M'Badon

### Woro-woro de Port-Bouët (1)

- woro woro : Marché de Port-Bouët ↔ Premoto

### Gbaka de Treichville (1)

- gbaka : Treichville Gare de Bassam ↔ Anani

### Gbaka de Grand-Bassam (1)

- gbaka : Treichville Gare de Bassam ↔ Grand-Bassam

### Inconnu (1)

- BRT d'Abidjan en Construction
