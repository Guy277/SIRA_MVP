"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
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
    });

    return () => { active = false; };
  }, [origin, destination, userLocation, mapStatus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapStatus !== "ready") return;

    const drawRoutes = () => {
      journeys.forEach((journey) => {
        const sourceId = `journey-${journey.id}`;
        const layerId = `journey-line-${journey.id}`;
        const data: GeoJSON.Feature<GeoJSON.LineString> = {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: journey.geometry },
        };
        const source = map.getSource(sourceId) as { setData: (value: GeoJSON.Feature<GeoJSON.LineString>) => void } | undefined;
        if (source) source.setData(data);
        else {
          map.addSource(sourceId, { type: "geojson", data });
          map.addLayer({
            id: layerId,
            type: "line",
            source: sourceId,
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": journey.color,
              "line-width": journey.id === selectedJourneyId ? 7 : 4,
              "line-opacity": journey.id === selectedJourneyId ? 0.95 : 0.32,
            },
          });
        }
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, "line-width", journey.id === selectedJourneyId ? 7 : 4);
          map.setPaintProperty(layerId, "line-opacity", journey.id === selectedJourneyId ? 0.95 : 0.3);
          if (journey.id === selectedJourneyId) map.moveLayer(layerId);
        }
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
        <span><i className="key-dot key-dot--route" />Itinéraire choisi</span>
        <span><i className="key-dot key-dot--alert" />Signalement</span>
      </div>
    </div>
  );
}
