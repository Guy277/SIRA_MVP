"use client";

import { useEffect, useRef, useState } from "react";
import type { FilterSpecification, LineLayerSpecification, Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import type { Journey, Place } from "@/lib/sira-data";
import { ABIDJAN_CENTER, REPORTS } from "@/lib/sira-data";

type Props = {
  origin: Place;
  destination: Place;
  journeys: Journey[];
  selectedJourneyId: string;
  userLocation?: [number, number] | null;
};

export default function SiraMap({ origin, destination, journeys, selectedJourneyId, userLocation }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    let cancelled = false;

    import("maplibre-gl")
      .then(({ default: maplibregl }) => {
        if (cancelled || !container.current) return;
        const map = new maplibregl.Map({
          container: container.current,
          style: "https://tiles.openfreemap.org/styles/liberty",
          center: ABIDJAN_CENTER,
          zoom: 12.2,
          attributionControl: false,
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
        map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
        map.on("load", () => {
          mapRef.current = map;
          setMapStatus("ready");
        });
        map.on("error", () => setMapStatus((value) => (value === "ready" ? value : "error")));
      })
      .catch(() => setMapStatus("error"));

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapStatus !== "ready") return;
    let active = true;

    import("maplibre-gl").then(({ default: maplibregl }) => {
      if (!active) return;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      const marker = (place: Place, kind: "origin" | "destination") => {
        const node = document.createElement("div");
        node.className = `sira-marker sira-marker--${kind}`;
        node.setAttribute("aria-label", place.name);
        const instance = new maplibregl.Marker({ element: node }).setLngLat(place.coordinates).addTo(map);
        markersRef.current.push(instance);
      };
      marker(origin, "origin");
      marker(destination, "destination");

      REPORTS.slice(0, 2).forEach((report, index) => {
        const node = document.createElement("button");
        node.className = `report-marker report-marker--${report.severity}`;
        node.title = `${report.title} — ${report.location}`;
        node.textContent = "!";
        const coordinates: [number, number] = index === 0 ? [-4.003, 5.328] : [-3.982, 5.345];
        markersRef.current.push(new maplibregl.Marker({ element: node }).setLngLat(coordinates).addTo(map));
      });

      if (userLocation) {
        const node = document.createElement("div");
        node.className = "user-marker";
        markersRef.current.push(new maplibregl.Marker({ element: node }).setLngLat(userLocation).addTo(map));
      }

      const selectedJourney = journeys.find((journey) => journey.id === selectedJourneyId);
      selectedJourney?.legs
        .filter((leg) => !["walk", "wait", "transfer"].includes(leg.mode) && leg.geometry.length)
        .forEach((leg, index) => {
          const node = document.createElement("div");
          node.className = "leg-marker";
          node.textContent = String(index + 1);
          node.title = leg.label;
          markersRef.current.push(new maplibregl.Marker({ element: node }).setLngLat(leg.geometry[0]).addTo(map));
        });
    });

    return () => { active = false; };
  }, [origin, destination, journeys, selectedJourneyId, userLocation, mapStatus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapStatus !== "ready") return;

    const drawRoutes = () => {
      journeys.forEach((journey) => {
        const sourceId = `journey-${journey.id}`;
        const data: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
          type: "FeatureCollection",
          features: journey.legs.filter((leg) => leg.geometry.length >= 2).map((leg) => ({
            type: "Feature",
            properties: { mode: leg.mode, color: journey.color },
            geometry: { type: "LineString", coordinates: leg.geometry },
          })),
        };
        const source = map.getSource(sourceId) as { setData: (value: GeoJSON.FeatureCollection<GeoJSON.LineString>) => void } | undefined;
        if (source) source.setData(data);
        else map.addSource(sourceId, { type: "geojson", data });

        const selected = journey.id === selectedJourneyId;
        const layers: Array<{ suffix: string; filter: FilterSpecification; paint: NonNullable<LineLayerSpecification["paint"]> }> = [
          {
            suffix: "transit",
            filter: ["!in", ["get", "mode"], ["literal", ["walk", "transfer"]]],
            paint: { "line-color": journey.color, "line-width": selected ? 7 : 4, "line-opacity": selected ? 0.95 : 0.25 },
          },
          {
            suffix: "walk",
            filter: ["==", ["get", "mode"], "walk"],
            paint: { "line-color": "#263238", "line-width": selected ? 5 : 3, "line-opacity": selected ? 0.85 : 0.18, "line-dasharray": [1, 1.4] },
          },
          {
            suffix: "transfer",
            filter: ["==", ["get", "mode"], "transfer"],
            paint: { "line-color": "#7b61ff", "line-width": selected ? 5 : 3, "line-opacity": selected ? 0.85 : 0.18, "line-dasharray": [2, 1.4] },
          },
        ];

        layers.forEach(({ suffix, filter, paint }) => {
          const layerId = `journey-line-${suffix}-${journey.id}`;
          if (!map.getLayer(layerId)) map.addLayer({ id: layerId, type: "line", source: sourceId, filter, layout: { "line-cap": "round", "line-join": "round" }, paint });
          map.setPaintProperty(layerId, "line-width", paint["line-width"]);
          map.setPaintProperty(layerId, "line-opacity", paint["line-opacity"]);
          if (selected) map.moveLayer(layerId);
        });
      });

      const coordinates = journeys.flatMap((journey) => journey.geometry);
      if (coordinates.length) {
        const lngs = coordinates.map(([lng]) => lng);
        const lats = coordinates.map(([, lat]) => lat);
        map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], {
          padding: { top: 120, right: 80, bottom: 120, left: 80 },
          duration: 700,
          maxZoom: 14,
        });
      }
    };

    if (map.isStyleLoaded()) drawRoutes();
    else map.once("load", drawRoutes);
  }, [journeys, selectedJourneyId, mapStatus]);

  return (
    <div className="map-shell">
      <div ref={container} className="map-canvas" aria-label="Carte interactive des itinéraires à Abidjan" />
      {mapStatus === "loading" && <div className="map-loading"><span />Chargement de la carte d’Abidjan…</div>}
      {mapStatus === "error" && (
        <div className="map-loading map-loading--error">
          <strong>Carte temporairement indisponible</strong>
          <small>Les itinéraires restent consultables dans le panneau.</small>
        </div>
      )}
      <div className="map-key" aria-label="Légende de la carte">
        <span><i className="key-line key-line--transit" />Transport</span>
        <span><i className="key-line key-line--walk" />Marche</span>
        <span><i className="key-dot key-dot--alert" />Alerte</span>
      </div>
    </div>
  );
}
