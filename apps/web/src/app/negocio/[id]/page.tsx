import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { BusinessContextMap } from "@/components/business/business-context-map";
import { backendFetch } from "@/lib/backend-client";
import { toBusiness } from "@/lib/business-adapter";
import { getScoreTheme } from "@/lib/score-theme";

type BusinessDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ radius?: string }>;
};

type ScoreBreakdownItem = {
  label: string;
  points: number;
  maxPoints: number;
  detail: string;
};

export default async function BusinessDetailPage({ params, searchParams }: BusinessDetailPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const radiusParam = Number(query.radius ?? "3");
  const radiusKm = [1, 3, 5].includes(radiusParam) ? radiusParam : 3;
  let business: ReturnType<typeof toBusiness>;
  let benchmark = {
    percentile: 0,
    neighborhoodAvg: 0,
    topQuartile: 0,
  };
  let recommendations: string[] = [];
  let scoreBreakdownFromApi: ScoreBreakdownItem[] = [];
  let comments: Array<{
    text: string;
    rating?: number;
    author?: string;
    relative_time?: string;
  }> = [];

  try {
    const detail = await backendFetch<{
      business: {
        _id: string;
        name?: string;
        category?: string;
        subcategory?: string;
        score?: number;
        gap?: number;
        reviews?: number;
        location?: { coordinates?: [number, number] };
        barrio?: { name?: string };
      };
      benchmark: {
        percentile: number;
        neighborhoodAvg: number;
        topQuartile: number;
      };
      recommendations: string[];
      score_breakdown?: Array<{
        label: string;
        points: number;
        max_points: number;
        detail: string;
      }>;
      comments?: Array<{
        text: string;
        rating?: number;
        author?: string;
        relative_time?: string;
      }>;
    }>(`/shops/id/${id}/detail`);
    business = toBusiness(detail.business);
    benchmark = detail.benchmark;
    recommendations = detail.recommendations;
    scoreBreakdownFromApi = (detail.score_breakdown ?? []).map((item) => ({
      label: item.label,
      points: item.points,
      maxPoints: item.max_points,
      detail: item.detail,
    }));
    comments = detail.comments ?? [];
  } catch {
    notFound();
  }

  const scoreTheme = getScoreTheme(business.score);
  const sectorLabel = business.subcategory ?? business.category;
  const nearbyBusinesses = await fetchNearbyCompetitors(business, radiusKm);
  const scoreBreakdown =
    scoreBreakdownFromApi.length > 0
      ? scoreBreakdownFromApi
      : buildScoreBreakdown({
          score: business.score,
          reviews: business.reviews,
          percentile: benchmark.percentile,
          gap: business.gap,
        });

  return (
    <div className="flex h-screen w-full flex-1 flex-col gap-4 overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
      <header className="rounded-3xl border border-line bg-surface px-6 py-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">
            Ficha de negocio
          </p>
          <Link
            href="/"
            className="inline-flex shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:bg-zinc-100"
          >
            Volver al dashboard
          </Link>
        </div>
        <h1 className="mt-2 font-serif text-3xl leading-tight sm:text-4xl">{business.name}</h1>
        <p className="mt-2 text-sm text-zinc-700">
          {business.neighborhood} - {sectorLabel}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill
            label={
              <LabelWithTooltip
                label={`Score ${business.score}/100`}
                tooltip="Puntuacion global del negocio (0-100) basada en senales de presencia y rendimiento digital."
              />
            }
            className={`${scoreTheme.chipClassName} border ${scoreTheme.borderClassName}`}
          />
          <Pill
            label={
              <LabelWithTooltip
                label={`Gap ${business.gap} pts`}
                tooltip="Brecha estimada de mejora: cuantos puntos podria ganar para acercarse al nivel competitivo de su entorno."
              />
            }
          />
          <Pill label={`${business.reviews} resenas`} />
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <Metric
          label="Percentil local"
          tooltip="Posicion relativa del negocio dentro de su categoria local. Un percentil mayor indica mejor posicion respecto al resto."
          value={`${benchmark.percentile}`}
        />
        <Metric
          label="Media del barrio"
          tooltip="Promedio de score de los negocios del mismo barrio. Sirve como referencia del contexto cercano."
          value={`${benchmark.neighborhoodAvg}`}
        />
        <Metric
          label="Top quartile"
          tooltip="Valor de referencia del 25% superior de negocios comparables en la categoria."
          value={`${benchmark.topQuartile}`}
        />
      </section>

      <section className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold">Ubicacion y competidores cercanos</h2>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
              Sector: {sectorLabel}
            </span>
            <div className="inline-flex rounded-full border border-line bg-white p-1 text-xs font-semibold">
              {[1, 3, 5].map((value) => (
                <Link
                  key={value}
                  href={`/negocio/${business.id}?radius=${value}`}
                  className={`rounded-full px-2 py-1 ${
                    radiusKm === value ? "bg-accent text-white" : "text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  {value} km
                </Link>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <BusinessContextMap items={nearbyBusinesses} />
          <aside className="max-h-[280px] overflow-auto rounded-2xl border border-line bg-surface-2 p-3">
            <h3 className="text-sm font-semibold">Negocios en el entorno</h3>
            <ul className="mt-3 space-y-2">
              {nearbyBusinesses.map((item) => {
                const theme = getScoreTheme(item.score);
                return (
                  <li
                    key={item.id}
                    className={`rounded-xl border bg-white px-3 py-2 ${theme.borderClassName} ${item.isSelected ? "ring-2 ring-zinc-800/25" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-900">{item.name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${theme.chipClassName}`}>
                        {item.score}
                      </span>
                    </div>
                      <p className="mt-1 text-xs text-zinc-600">
                        {item.isSelected ? "Negocio seleccionado" : `${item.distanceKm.toFixed(2)} km`}
                      </p>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      </section>

      <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-3">
        <section className="min-h-0 rounded-3xl border border-line bg-surface p-5 shadow-sm xl:col-span-1">
          <h2 className="font-semibold">Desglose del score</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Asi se reparte la puntuacion total ({business.score}/100) entre los factores del modelo.
        </p>
        <ul className="mt-4 space-y-3 overflow-auto pr-1">
          {scoreBreakdown.map((item) => {
            const width = `${Math.max(0, Math.min(100, (item.points / item.maxPoints) * 100))}%`;
            return (
              <li key={item.label} className="rounded-2xl border border-line bg-surface-2 p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <p className="font-semibold">{item.label}</p>
                  <p className="font-semibold text-accent">
                    {item.points}/{item.maxPoints} pts
                  </p>
                </div>
                <div className="mt-2 h-2 rounded-full bg-zinc-200">
                  <div className="h-2 rounded-full bg-accent" style={{ width }} />
                </div>
                <p className="mt-2 text-xs text-zinc-600">{item.detail}</p>
              </li>
            );
          })}
        </ul>
        </section>

        <section className="min-h-0 rounded-3xl border border-line bg-surface p-5 shadow-sm xl:col-span-1">
          <h2 className="font-semibold">Top acciones recomendadas</h2>
          <ol className="mt-3 space-y-2 overflow-auto pr-1 text-sm text-zinc-700">
            {recommendations.map((item, index) => (
              <li key={item} className="rounded-xl border border-line bg-surface-2 px-3 py-2">
                <span className="mr-2 font-semibold text-accent">{index + 1}.</span>
                {item}
              </li>
            ))}
          </ol>
        </section>

        <section className="min-h-0 rounded-3xl border border-line bg-surface p-5 shadow-sm xl:col-span-1">
          <h2 className="font-semibold">Comentarios detectados</h2>
          {comments.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">No hay comentarios almacenados para este negocio.</p>
          ) : (
            <ul className="mt-3 max-h-full space-y-2 overflow-auto pr-1 text-sm text-zinc-700">
              {comments.map((comment, index) => (
                <li key={`${comment.text}-${index}`} className="rounded-xl border border-line bg-surface-2 px-3 py-2">
                  <p>{comment.text}</p>
                  <p className="mt-2 text-xs text-zinc-500">
                    {comment.author ? `${comment.author} - ` : ""}
                    {typeof comment.rating === "number" ? `${comment.rating}/5` : "Sin rating"}
                    {comment.relative_time ? ` - ${comment.relative_time}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>

    </div>
  );
}

async function fetchNearbyCompetitors(business: ReturnType<typeof toBusiness>, radiusKm: number) {
  const selectedSector = normalizeSectorLabel(business.subcategory ?? business.category);
  const radiusLat = radiusKm / 111;
  const lonFactor = Math.max(0.2, Math.cos((business.lat * Math.PI) / 180));
  const radiusLon = radiusKm / (111 * lonFactor);
  const south = business.lat - radiusLat;
  const north = business.lat + radiusLat;
  const west = business.lon - radiusLon;
  const east = business.lon + radiusLon;

  try {
    const payload = await backendFetch<{
      shops: Array<{
        _id: string;
        name?: string;
        category?: string;
        subcategory?: string;
        score?: number;
        gap?: number;
        reviews?: number;
        location?: { coordinates?: [number, number] };
        barrio?: { name?: string };
      }>;
    }>(
      `/shops?active_only=true&limit=500&skip=0&category=${encodeURIComponent(business.category)}&south=${south}&west=${west}&north=${north}&east=${east}`,
    );

    const nearby = payload.shops
      .map((shop) => toBusiness(shop))
      .filter((item) => normalizeSectorLabel(item.subcategory ?? item.category) === selectedSector)
      .map((item) => {
        const distanceKm = haversineKm(business.lat, business.lon, item.lat, item.lon);
        return {
          id: item.id,
          name: item.name,
          category: item.category,
          subcategory: item.subcategory,
          neighborhood: item.neighborhood,
          lat: item.lat,
          lon: item.lon,
          score: item.score,
          isSelected: item.id === business.id,
          distanceKm,
        };
      })
      .filter((item) => item.isSelected || item.distanceKm <= radiusKm)
      .sort((a, b) => {
        if (a.isSelected) return -1;
        if (b.isSelected) return 1;
        return a.distanceKm - b.distanceKm;
      })
      .slice(0, 12);

    if (!nearby.some((item) => item.isSelected)) {
      nearby.unshift({
        id: business.id,
        name: business.name,
        category: business.category,
        subcategory: business.subcategory,
        neighborhood: business.neighborhood,
        lat: business.lat,
        lon: business.lon,
        score: business.score,
        isSelected: true,
        distanceKm: 0,
      });
    }

    return nearby;
  } catch {
    return [
      {
        id: business.id,
        name: business.name,
        category: business.category,
        subcategory: business.subcategory,
        neighborhood: business.neighborhood,
        lat: business.lat,
        lon: business.lon,
        score: business.score,
        isSelected: true,
        distanceKm: 0,
      },
    ];
  }
}

function normalizeSectorLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return earthKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function LabelWithTooltip({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <span className="group relative inline-flex items-center gap-1">
      <span>{label}</span>
      <span
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-current text-[10px] leading-none opacity-80"
        aria-label={tooltip}
        tabIndex={0}
      >
        i
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-lg border border-line bg-white px-3 py-2 text-[11px] font-medium text-zinc-700 opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {tooltip}
      </span>
    </span>
  );
}

function Pill({ label, className }: { label: ReactNode; className?: string }) {
  return (
    <span
      className={`rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent ${className ?? ""}`}
    >
      {label}
    </span>
  );
}

function Metric({ label, tooltip, value }: { label: string; tooltip?: string; value: string }) {
  return (
    <article className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
      <p className="text-xs text-zinc-600">
        {tooltip ? <LabelWithTooltip label={label} tooltip={tooltip} /> : label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </article>
  );
}

function buildScoreBreakdown(input: {
  score: number;
  reviews: number;
  percentile: number;
  gap: number;
}): ScoreBreakdownItem[] {
  const maxByFactor = {
    reputation: 40,
    demand: 25,
    positioning: 20,
    hygiene: 15,
  };

  const reputation = clamp(
    Math.round(input.score * 0.34 + Math.min(10, input.reviews / 20)),
    0,
    maxByFactor.reputation,
  );
  const demand = clamp(Math.round(input.percentile * 0.25), 0, maxByFactor.demand);
  const positioning = clamp(
    Math.round((100 - input.gap) * 0.2),
    0,
    maxByFactor.positioning,
  );
  const hygiene = clamp(Math.round(input.score * 0.15), 0, maxByFactor.hygiene);

  const raw = [
    {
      label: "Reputacion y resenas",
      points: reputation,
      maxPoints: maxByFactor.reputation,
      detail: "Valoracion por calidad de comentarios y volumen de resenas recientes.",
    },
    {
      label: "Demanda local",
      points: demand,
      maxPoints: maxByFactor.demand,
      detail: "Ajuste segun percentil del negocio frente a su entorno cercano.",
    },
    {
      label: "Posicion competitiva",
      points: positioning,
      maxPoints: maxByFactor.positioning,
      detail: "Impacto de la distancia respecto al objetivo (gap) frente al top del sector.",
    },
    {
      label: "Higiene de ficha",
      points: hygiene,
      maxPoints: maxByFactor.hygiene,
      detail: "Consistencia de datos clave (categoria, presencia y calidad basica de perfil).",
    },
  ];

  const total = raw.reduce((acc, item) => acc + item.points, 0);
  const delta = input.score - total;

  if (delta !== 0) {
    raw[0] = {
      ...raw[0],
      points: clamp(raw[0].points + delta, 0, raw[0].maxPoints),
    };
  }

  return raw;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
