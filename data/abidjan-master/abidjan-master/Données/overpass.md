# Requêtes Overpass

L'API [Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API) vous permet d'effectuer des requêtes d'extractions personnalisées de données OpenStreetMap.

Pour un rappel des attributs OSM utilisés par le projet, vous pouvez consulter la [page de wiki](https://wiki.openstreetmap.org/wiki/FR:WikiProject_C%C3%B4te_d%27Ivoire/Transport_Abidjan).

## Gares routières
http://overpass-turbo.eu/s/KWD
```
[out:json];
{{geocodeArea:abidjan}}->.searchArea;
(
  way["amenity"="bus_station"](area.searchArea);
);
out body;
>;
out skel qt;
```

## Arrêts de bus
http://overpass-turbo.eu/s/KWC
```
//[out:csv(::"id", name, official_status, shelter)];
[out:json];
{{geocodeArea:abidjan}}->.searchArea;
(
  node["highway"="bus_stop"](area.searchArea);
);
out body;
>;
out skel qt;
```

## Arrêts de bateau
http://overpass-turbo.eu/s/KWB
```
//[out:csv(::"id", name, official_status, man_made)];
[out:json];
{{geocodeArea:abidjan}}->.searchArea;
(
  node["public_transport"="platform"]["ferry"="yes"](area.searchArea);
    way["public_transport"="platform"]["ferry"="yes"](area.searchArea);

);
out body;
>;
out skel qt;
```

## Liste des lignes de bus
http://overpass-turbo.eu/s/KWA
```
[out:csv(::"id", route_master, ref, operator, network, colour, interval, "interval:conditional", opening_hours, charge, bus, ::"user")];

{{geocodeArea:abidjan}}->.searchArea;

relation
  ["type"="route"]["route"="bus"]
  (area.searchArea)
;
rel(br)["type"="route_master"];
out meta;
```

## Liste des lignes de bateau
http://overpass-turbo.eu/s/KWz
```
[out:csv(::"id", route_master, ref, operator, network, colour, interval, "interval:conditional", opening_hours, charge, ferry, ::"user")];

{{geocodeArea:abidjan}}->.searchArea;

relation
  ["type"="route"]["route"="ferry"]
  (area.searchArea)
;
rel(br)["type"="route_master"];
out meta;

```

## Détail des lignes de bus
http://overpass-turbo.eu/s/KWy
```
[out:json][timeout:250];

{{geocodeArea:abidjan}}->.searchArea;

relation
  ["type"="route"]["route"="bus"]
  (area.searchArea)
;
out body;
>;
out skel qt;

```

## Détail des lignes de bateau
http://overpass-turbo.eu/s/KWx
```
[out:json][timeout:250];

{{geocodeArea:abidjan}}->.searchArea;

relation
  ["type"="route"]["route"="ferry"]
  (area.searchArea)
;
out body;
>;
out skel qt;

```
