"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { OpportunityList } from "@/components/business/opportunity-list";
import { MetricCard } from "@/components/dashboard/metric-card";
import { MapView } from "@/components/map/map-view";
import { getBusinesses } from "@/lib/api-client";
import type { ViewportBounds } from "@/lib/api-client";
import type { Business } from "@/lib/mock-data";
import { getScoreTheme } from "@/lib/score-theme";

export function DashboardShell() {
  const MAX_MAP_MARKERS = 300;
  const MAX_OPPORTUNITIES = 120;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [copyState, setCopyState] = useState<"idle" | "ok" | "error">("idle");
  const [viewportBounds, setViewportBounds] = useState<ViewportBounds | undefined>();

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        setStatus("loading");
        const payload = await getBusinesses(viewportBounds);
        setBusinesses(payload.businesses);
        setNeighborhoods(payload.neighborhoods);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    }, viewportBounds ? 350 : 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [viewportBounds]);

  const selectedNeighborhood = searchParams.get("barrio") ?? "all";
  const selectedCategory =
    searchParams.get("sector") ?? searchParams.get("rubro") ?? "all";
  const rawScore = Number(searchParams.get("score_min") ?? "0");
  const minScore = Number.isNaN(rawScore) ? 0 : Math.max(0, Math.min(100, rawScore));

  const categories = useMemo(() => {
    return Array.from(new Set(businesses.map((item) => item.subcategory ?? item.category))).sort();
  }, [businesses]);

  const filteredBusinesses = useMemo(() => {
    return businesses.filter((item) => {
      const neighborhoodMatch =
        selectedNeighborhood === "all" || item.neighborhood === selectedNeighborhood;
      const sectorValue = item.subcategory ?? item.category;
      const categoryMatch = selectedCategory === "all" || sectorValue === selectedCategory;
      const scoreMatch = item.score >= minScore;

      return neighborhoodMatch && categoryMatch && scoreMatch;
    });
  }, [businesses, selectedNeighborhood, selectedCategory, minScore]);

  const activeFilterCount =
    Number(selectedNeighborhood !== "all") +
    Number(selectedCategory !== "all") +
    Number(minScore > 0);

  function updateUrlFilters(next: {
    neighborhood?: string;
    category?: string;
    score?: number;
  }) {
    const neighborhood = next.neighborhood ?? selectedNeighborhood;
    const category = next.category ?? selectedCategory;
    const score = next.score ?? minScore;

    const params = new URLSearchParams();
    if (neighborhood !== "all") {
      params.set("barrio", neighborhood);
    }
    if (category !== "all") {
      params.set("sector", category);
    }
    if (score > 0) {
      params.set("score_min", String(score));
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  async function handleSaveView() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState("ok");
    } catch {
      setCopyState("error");
    }

    window.setTimeout(() => {
      setCopyState("idle");
    }, 1800);
  }

  const summary = useMemo(() => {
    if (filteredBusinesses.length === 0) {
      return { avgScore: 0, avgGap: 0 };
    }

    const avgScore = Math.round(
      filteredBusinesses.reduce((acc, item) => acc + item.score, 0) /
        filteredBusinesses.length,
    );
    const avgGap = Math.round(
      filteredBusinesses.reduce((acc, item) => acc + item.gap, 0) /
        filteredBusinesses.length,
    );

    return { avgScore, avgGap };
  }, [filteredBusinesses]);

  const summaryTheme = getScoreTheme(summary.avgScore);
  const minScoreTheme = getScoreTheme(minScore);
  const mapBusinesses = filteredBusinesses.slice(0, MAX_MAP_MARKERS);

  if (status === "error") {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-900">
        No se pudieron cargar los datos del dashboard.
      </div>
    );
  }

  return (
    <>
      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Barrios activos"
          value={selectedNeighborhood === "all" ? undefined : selectedNeighborhood}
          numericValue={selectedNeighborhood === "all" ? neighborhoods.length : undefined}
        />
        <MetricCard
          label="Negocios analizados"
          numericValue={filteredBusinesses.length}
        />
        <MetricCard
          label="Score medio"
          numericValue={summary.avgScore}
          suffix="/100"
          toneClassName={summaryTheme.chipClassName}
        />
        <MetricCard label="Brecha media" numericValue={summary.avgGap} suffix=" pts" />
      </section>

      <section className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-semibold">Filtros</h2>
            <p className="text-sm text-zinc-600">
              Ajusta barrio, sector y score para explorar oportunidades.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700">
                {filteredBusinesses.length} resultados
              </span>
              <span className="rounded-full bg-accent-soft px-2 py-1 text-accent">
                {activeFilterCount} filtros activos
              </span>
              {selectedNeighborhood !== "all" && (
                <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-2 py-1 text-zinc-700">
                  Barrio: {selectedNeighborhood}
                  <button
                    type="button"
                    onClick={() => updateUrlFilters({ neighborhood: "all" })}
                    className="rounded-full px-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                    aria-label="Quitar filtro de barrio"
                  >
                    x
                  </button>
                </span>
              )}
              {selectedCategory !== "all" && (
                <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-2 py-1 text-zinc-700">
                  Sector: {selectedCategory}
                  <button
                    type="button"
                    onClick={() => updateUrlFilters({ category: "all" })}
                    className="rounded-full px-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                    aria-label="Quitar filtro de sector"
                  >
                    x
                  </button>
                </span>
              )}
              {minScore > 0 && (
                <span
                  className={`inline-flex items-center gap-2 rounded-full border bg-white px-2 py-1 ${minScoreTheme.borderClassName} ${minScoreTheme.chipClassName}`}
                >
                  Score min: {minScore}
                  <button
                    type="button"
                    onClick={() => updateUrlFilters({ score: 0 })}
                    className="rounded-full px-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                    aria-label="Quitar filtro de score"
                  >
                    x
                  </button>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                updateUrlFilters({ neighborhood: "all", category: "all", score: 0 });
              }}
              className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-zinc-100"
            >
              Limpiar filtros
            </button>
            <button
              type="button"
              onClick={handleSaveView}
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Guardar vista
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-2 text-sm">
            <span className="font-semibold">Barrio</span>
            <select
              value={selectedNeighborhood}
              onChange={(event) => {
                const value = event.target.value;
                updateUrlFilters({ neighborhood: value });
              }}
              className="rounded-xl border border-line bg-white px-3 py-2"
            >
              <option value="all">Todos</option>
              {neighborhoods.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="font-semibold">Sector</span>
            <select
              value={selectedCategory}
              onChange={(event) => {
                const value = event.target.value;
                updateUrlFilters({ category: value });
              }}
              className="rounded-xl border border-line bg-white px-3 py-2"
            >
              <option value="all">Todos</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="flex items-center justify-between font-semibold">
              Score minimo
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">
                {minScore}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={minScore}
              onChange={(event) => {
                const value = Number(event.target.value);
                updateUrlFilters({ score: value });
              }}
              className="accent-[var(--accent)]"
            />
          </label>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-semibold">Mapa de oportunidades</h2>
            <div className="flex items-center gap-2">
              <MapLegendDot label="Alto" className="bg-emerald-600" />
              <MapLegendDot label="Medio" className="bg-amber-500" />
              <MapLegendDot label="Bajo" className="bg-rose-600" />
              <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
                {status === "loading"
                  ? "Cargando"
                  : `OpenStreetMap activo (${mapBusinesses.length})`}
              </span>
            </div>
          </div>
          <MapView businesses={mapBusinesses} onBoundsChange={setViewportBounds} />
        </div>

        <OpportunityList businesses={filteredBusinesses} maxItems={MAX_OPPORTUNITIES} />
      </section>

      <div className="pointer-events-none fixed right-4 bottom-4 z-50 sm:right-6 sm:bottom-6">
        <AnimatePresence mode="wait">
          {copyState !== "idle" && (
            <motion.div
              key={copyState}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className={`rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg backdrop-blur ${
                copyState === "ok"
                  ? "border-emerald-200 bg-emerald-50/95 text-emerald-800"
                  : "border-red-200 bg-red-50/95 text-red-800"
              }`}
              role="status"
              aria-live="polite"
            >
              {copyState === "ok"
                ? "Enlace copiado al portapapeles."
                : "No se pudo copiar el enlace."}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

function MapLegendDot({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2 py-1 text-xs text-zinc-700">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} aria-hidden="true" />
      {label}
    </span>
  );
}
