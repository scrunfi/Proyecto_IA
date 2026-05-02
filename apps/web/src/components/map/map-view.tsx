"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useRef } from "react";
import L from "leaflet";

import type { Business } from "@/lib/mock-data";
import { getScoreTheme } from "@/lib/score-theme";

type MapViewProps = {
  businesses: Business[];
};

const ALMERIA_CENTER: [number, number] = [-2.4597, 36.834];

export function MapView({ businesses }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    const map = L.map(mapRef.current, {
      center: [ALMERIA_CENTER[1], ALMERIA_CENTER[0]],
      zoom: 11.6,
      zoomControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);

    businesses.forEach((business) => {
      const theme = getScoreTheme(business.score);
      const marker = L.divIcon({
        className: "",
        html: `<span style="display:block;height:14px;width:14px;border-radius:9999px;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.3);background:${theme.color};"></span>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      L.marker([business.lat, business.lon], { icon: marker })
        .bindPopup(
          `<div style="min-width:210px;border:1px solid ${theme.color};border-radius:12px;padding:10px 10px 11px;background:#ffffff;font-family:Manrope,system-ui,sans-serif;color:#18181b;line-height:1.35;"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;"><p style="margin:0;font-size:14px;font-weight:700;">${business.name}</p><span style="display:inline-flex;align-items:center;justify-content:center;padding:3px 8px;border-radius:999px;background:${theme.softBackground};color:${theme.color};font-size:11px;font-weight:800;">${business.score}</span></div><p style="margin:4px 0 0;color:#52525b;font-size:12px;">${business.neighborhood} - ${business.category}</p><a href="/negocio/${business.id}" style="display:inline-block;margin-top:10px;padding:7px 11px;border-radius:999px;background:${theme.color};color:#ffffff;font-weight:700;text-decoration:none;font-size:12px;line-height:1;letter-spacing:0.01em;">Ver detalle</a></div>`,
          { offset: [0, -8] },
        )
        .addTo(map);
    });

    return () => {
      map.remove();
    };
  }, [businesses]);

  return <div ref={mapRef} className="h-[360px]" />;
}
