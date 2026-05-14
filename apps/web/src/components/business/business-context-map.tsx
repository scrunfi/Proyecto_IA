"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef, useState } from "react";

import { getScoreTheme } from "@/lib/score-theme";

type NearbyBusiness = {
  id: string;
  name: string;
  category: string;
  subcategory?: string;
  neighborhood: string;
  lat: number;
  lon: number;
  score: number;
  isSelected: boolean;
  distanceKm: number;
};

type BusinessContextMapProps = {
  items: NearbyBusiness[];
};

export function BusinessContextMap({ items }: BusinessContextMapProps) {
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<unknown>(null);
  const leafletRef = useRef<unknown>(null);
  const markersLayerRef = useRef<unknown>(null);
  const isInitializingRef = useRef(false);

  useEffect(() => {
    async function setupMap() {
      if (!mapRef.current || leafletMapRef.current || isInitializingRef.current) {
        return;
      }

      isInitializingRef.current = true;

      try {
        const L = (await import("leaflet")).default;
        leafletRef.current = L;

        if (!mapRef.current || leafletMapRef.current) {
          return;
        }

        const container = mapRef.current as HTMLDivElement & { _leaflet_id?: number };
        if (container._leaflet_id) {
          delete container._leaflet_id;
        }

        const map = L.map(container, {
          center: [36.834, -2.4597],
          zoom: 12,
          zoomControl: false,
        });
        leafletMapRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        L.control.zoom({ position: "topright" }).addTo(map);
        markersLayerRef.current = L.layerGroup().addTo(map);
        setMapReady(true);
      } finally {
        isInitializingRef.current = false;
      }
    }

    setupMap();

    return () => {
      if (leafletMapRef.current) {
        (leafletMapRef.current as { remove: () => void }).remove();
        leafletMapRef.current = null;
        markersLayerRef.current = null;
        leafletRef.current = null;
      }
      setMapReady(false);
      isInitializingRef.current = false;
    };
  }, []);

  useEffect(() => {
    type LeafletRuntime = {
      divIcon: (options: {
        className: string;
        html: string;
        iconSize: [number, number];
        iconAnchor: [number, number];
      }) => unknown;
      marker: (coords: [number, number], options: { icon: unknown }) => {
        bindPopup: (html: string, options: { offset: [number, number] }) => { addTo: (layer: unknown) => void };
      };
      latLngBounds: (coords: [number, number][]) => { pad: (value: number) => unknown };
    };

    const L = leafletRef.current as LeafletRuntime | null;
    const map = leafletMapRef.current as { fitBounds: (bounds: unknown) => void } | null;
    const markersLayer = markersLayerRef.current as { clearLayers: () => void } | null;
    if (!L || !map || !markersLayer) {
      return;
    }

    markersLayer.clearLayers();
    const coords: [number, number][] = [];

    items.forEach((item) => {
      coords.push([item.lat, item.lon]);
      const theme = getScoreTheme(item.score);
      const size = item.isSelected ? 18 : 14;
      const stroke = item.isSelected ? "#111827" : "#ffffff";
      const strokeWidth = item.isSelected ? 3 : 2;
      const marker = L.divIcon({
        className: "",
        html: `<span style="display:block;height:${size}px;width:${size}px;border-radius:9999px;border:${strokeWidth}px solid ${stroke};box-shadow:0 1px 4px rgba(0,0,0,0.3);background:${theme.color};"></span>`,
        iconSize: [size, size],
        iconAnchor: [Math.round(size / 2), Math.round(size / 2)],
      });

      const sectorLabel = item.subcategory ?? item.category;
      const badge = item.isSelected ? "<span style='margin-left:6px;font-size:10px;color:#111827;font-weight:800;'>Seleccionado</span>" : "";
      L.marker([item.lat, item.lon], { icon: marker })
        .bindPopup(
          `<div style="min-width:220px;border:1px solid ${theme.color};border-radius:12px;padding:10px;background:#fff;font-family:Manrope,system-ui,sans-serif;"><p style="margin:0;font-weight:700;font-size:14px;color:#18181b;">${item.name}${badge}</p><p style="margin:4px 0 0;font-size:12px;color:#52525b;">${item.neighborhood} - ${sectorLabel}</p><p style="margin:8px 0 0;font-size:12px;color:#18181b;"><strong>Score:</strong> ${item.score} · <strong>Distancia:</strong> ${item.distanceKm.toFixed(2)} km</p></div>`,
          { offset: [0, -8] },
        )
        .addTo(markersLayer);
    });

    if (coords.length > 0) {
      map.fitBounds(L.latLngBounds(coords).pad(0.2));
    }
  }, [items, mapReady]);

  return (
    <div className="relative h-[280px] rounded-2xl">
      {!mapReady && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl border border-line bg-surface-2 text-sm font-semibold text-zinc-600">
          Cargando mapa...
        </div>
      )}
      <div ref={mapRef} className="h-[280px] rounded-2xl" />
    </div>
  );
}
