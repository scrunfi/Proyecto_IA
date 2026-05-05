"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef } from "react";

import type { Business } from "@/lib/mock-data";
import { getScoreTheme } from "@/lib/score-theme";

type MapViewProps = {
  businesses: Business[];
  onBoundsChange?: (bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  }) => void;
};

const ALMERIA_CENTER: [number, number] = [-2.4597, 36.834];

export function MapView({ businesses, onBoundsChange }: MapViewProps) {
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
          center: [ALMERIA_CENTER[1], ALMERIA_CENTER[0]],
          zoom: 11.6,
          zoomControl: false,
        });
        leafletMapRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        L.control.zoom({ position: "topright" }).addTo(map);

        const markersLayer = L.layerGroup().addTo(map);
        markersLayerRef.current = markersLayer;

        if (onBoundsChange) {
          const emitBounds = () => {
            const bounds = map.getBounds();
            onBoundsChange({
              south: bounds.getSouth(),
              west: bounds.getWest(),
              north: bounds.getNorth(),
              east: bounds.getEast(),
            });
          };
          map.on("moveend", emitBounds);
          emitBounds();
        }
      } finally {
        isInitializingRef.current = false;
      }
    }

    setupMap();

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        markersLayerRef.current = null;
        leafletRef.current = null;
      }
      isInitializingRef.current = false;
    };
  }, [onBoundsChange]);

  useEffect(() => {
    type LeafletRuntime = {
      divIcon: (options: {
        className: string;
        html: string;
        iconSize: [number, number];
        iconAnchor: [number, number];
      }) => unknown;
      marker: (coords: [number, number], options: { icon: unknown }) => {
        bindPopup: (html: string, options: { offset: [number, number] }) => {
          addTo: (layer: unknown) => void;
        };
      };
    };

    type LayerRuntime = {
      clearLayers: () => void;
    };

    const L = leafletRef.current as LeafletRuntime | null;
    const map = leafletMapRef.current;
    const markersLayer = markersLayerRef.current as LayerRuntime | null;
    if (!L || !map || !markersLayer) {
      return;
    }

    markersLayer.clearLayers();

    businesses.forEach((business) => {
      const theme = getScoreTheme(business.score);
      const sectorLabel = business.subcategory ?? business.category;
      const marker = L.divIcon({
        className: "",
        html: `<span style="display:block;height:14px;width:14px;border-radius:9999px;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.3);background:${theme.color};"></span>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      L.marker([business.lat, business.lon], { icon: marker })
        .bindPopup(
          `<div style="min-width:210px;border:1px solid ${theme.color};border-radius:12px;padding:10px 10px 11px;background:#ffffff;font-family:Manrope,system-ui,sans-serif;color:#18181b;line-height:1.35;"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;"><p style="margin:0;font-size:14px;font-weight:700;">${business.name}</p><span style="display:inline-flex;align-items:center;justify-content:center;padding:3px 8px;border-radius:999px;background:${theme.softBackground};color:${theme.color};font-size:11px;font-weight:800;">${business.score}</span></div><p style="margin:4px 0 0;color:#52525b;font-size:12px;">${business.neighborhood} - ${sectorLabel}</p><a href="/negocio/${business.id}" style="display:inline-block;margin-top:10px;padding:7px 11px;border-radius:999px;background:${theme.color};color:#ffffff;font-weight:700;text-decoration:none;font-size:12px;line-height:1;letter-spacing:0.01em;">Ver detalle</a></div>`,
          { offset: [0, -8] },
        )
        .addTo(markersLayer);
    });
  }, [businesses]);

  return <div ref={mapRef} className="h-[360px]" />;
}
