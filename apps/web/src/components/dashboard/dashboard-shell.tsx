"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import { OpportunityList } from "@/components/business/opportunity-list";
import { MetricCard } from "@/components/dashboard/metric-card";
import { MapView } from "@/components/map/map-view";
import { getBusinesses } from "@/lib/api-client";
import type { Business } from "@/lib/mock-data";
import { getScoreTheme } from "@/lib/score-theme";
import { getSubsectorLabel } from "@/lib/subsector-label";

const CATEGORY_GROUPS: Array<{ label: string; patterns: RegExp[] }> = [
  {
    label: "Restauracion",
    patterns: [/\brestaur/i, /\bhosteler/i, /\bbar(es)?\b/i, /\bcaf(e|eter)/i],
  },
  {
    label: "Alimentacion",
    patterns: [/\baliment/i, /\bpanader/i, /\bpasteler/i, /\bsupermerc/i, /\bcarnicer/i],
  },
  {
    label: "Salud",
    patterns: [/\bsalud\b/i, /\bfarmaci/i, /\bclinic/i, /\bdental/i, /\bfisio/i],
  },
  {
    label: "Peluquerias y belleza",
    patterns: [/\bbelleza\b/i, /\bpeluquer/i, /\bestetica\b/i, /\bbarber/i, /\bunas\b/i],
  },
  {
    label: "Automocion",
    patterns: [/\bautomoc/i, /\btaller/i, /\bmecanic/i, /\bneumatic/i, /\bvehicul/i],
  },
  {
    label: "Hogar",
    patterns: [/\bhogar\b/i, /\bmueble/i, /\bdecorac/i, /\bbricolaje/i, /\bferreter/i],
  },
  {
    label: "Reformas y construccion",
    patterns: [/\breforma/i, /\bconstrucc/i, /\balbanil/i, /\bfontaner/i, /\belectric/i],
  },
  {
    label: "Comercios",
    patterns: [/\bmoda\b/i, /\bropa\b/i, /\bcalzado\b/i, /\bjoyer/i, /\bcomplement/i],
  },
  {
    label: "Tecnologia",
    patterns: [/\btecnolog/i, /\binformatic/i, /\belectronic/i, /\bmovil(es)?\b/i, /\bpc\b/i],
  },
  {
    label: "Educacion",
    patterns: [/\beducac/i, /\bacadem/i, /\bformac/i, /\bidioma/i, /\bescuela\b/i],
  },
  {
    label: "Deporte y bienestar",
    patterns: [/\bdeporte/i, /\bgimnas/i, /\bfitness/i, /\byoga\b/i, /\bpilates\b/i],
  },
  {
    label: "Ocio y cultura",
    patterns: [/\bocio\b/i, /\bcultura\b/i, /\blibrer/i, /\bcine\b/i, /\bevento/i],
  },
  {
    label: "Servicios profesionales",
    patterns: [/\bgestor/i, /\babogad/i, /\bconsultor/i, /\basesor/i, /\binmobiliari/i],
  },
  {
    label: "Finanzas y seguros",
    patterns: [/\bbanc/i, /\bfinanz/i, /\bcredito/i, /\bseguro/i, /\bcorredur/i],
  },
  {
    label: "Turismo y alojamiento",
    patterns: [/\bturism/i, /\bhotel/i, /\balojamiento/i, /\bhostal/i, /\bviaje/i],
  },
  {
    label: "Transporte y logistica",
    patterns: [/\btransporte/i, /\blogistic/i, /\benvio/i, /\bpaqueter/i, /\btaxi\b/i],
  },
  {
    label: "Industria y suministros",
    patterns: [/\bindustr/i, /\bsuministro/i, /\bmaquinaria/i, /\bfabric/i, /\bmaterial/i],
  },
  {
    label: "Arte e impresion",
    patterns: [/\barte\b/i, /\bdiseno\b/i, /\bimprent/i, /\bserigraf/i, /\bfotograf/i],
  },
  {
    label: "Infantil y familia",
    patterns: [/\binfantil/i, /\bjuguet/i, /\bguarder/i, /\bfamilia\b/i, /\bbebe\b/i],
  },
  {
    label: "Servicios personales",
    patterns: [/\blimpieza\b/i, /\blavander/i, /\bmensajer/i, /\breparacion\b/i],
  },
  {
    label: "Mascotas",
    patterns: [/\bmascota/i, /\bveterinari/i, /\bpet\b/i],
  },
];

const CATEGORY_LABELS = new Set([
  ...CATEGORY_GROUPS.map((group) => group.label),
  "Servicios locales",
  "Comercio especializado",
  "Creatividad y medios",
  "Ocio y experiencias",
]);

function normalizeCategory(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getCategoryGroup(value: string) {
  const normalized = normalizeCategory(value);

  for (const group of CATEGORY_GROUPS) {
    if (group.patterns.some((pattern) => pattern.test(normalized))) {
      return group.label;
    }
  }

  if (/\bservicio|\brepara|\binstala|\bmantenimiento|\basistencia/i.test(normalized)) {
    return "Servicios locales";
  }

  if (/\bshop|\bstore|\boutlet|\bmarket|\bventa|\bcomerc/i.test(normalized)) {
    return "Comercio especializado";
  }

  if (/\bstudio|\bcreativ|\bagencia|\bmedia|\bproduccion/i.test(normalized)) {
    return "Creatividad y medios";
  }

  if (/\bclub|\bocio|\bentreten|\bmusica|\bartesania/i.test(normalized)) {
    return "Ocio y experiencias";
  }

  return "Comercios";
}

export function DashboardShell() {
  const MAX_MAP_MARKERS = 300;
  const MAX_OPPORTUNITIES = 120;
  const MIN_SUBCATEGORY_COUNT = 4;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<string[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [copyState, setCopyState] = useState<"idle" | "ok" | "error">("idle");
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        setStatus("loading");
        const payload = await getBusinesses();
        setBusinesses(payload.businesses);
        setNeighborhoods(payload.neighborhoods);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  const selectedNeighborhood = searchParams.get("barrio") ?? "all";
  const selectedCategory =
    searchParams.get("sector") ?? searchParams.get("rubro") ?? "all";
  const selectedGroupedCategory =
    selectedCategory === "all"
      ? "all"
      : CATEGORY_LABELS.has(selectedCategory)
        ? selectedCategory
        : getCategoryGroup(selectedCategory);
  const selectedSubcategory = searchParams.get("subgrupo") ?? searchParams.get("subcategory") ?? "all";
  const rawScore = Number(searchParams.get("score_min") ?? "0");
  const minScore = Number.isNaN(rawScore) ? 0 : Math.max(0, Math.min(100, rawScore));
  const commentsParam = searchParams.get("comments");
  const commentsFilter: "all" | "with" | "without" =
    commentsParam === "with" || commentsParam === "without" ? commentsParam : "all";
  const websiteParam = searchParams.get("website");
  const websiteFilter: "all" | "with" | "without" =
    websiteParam === "with" || websiteParam === "without" ? websiteParam : "all";

  const groupedBusinesses = useMemo(() => {
    return businesses.map((item) => ({
      ...item,
      groupedCategory: getCategoryGroup(item.subcategory ?? item.category),
    }));
  }, [businesses]);

  const effectiveSelectedNeighborhood =
    selectedNeighborhood === "all" || neighborhoods.includes(selectedNeighborhood)
      ? selectedNeighborhood
      : "all";

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    const source =
      effectiveSelectedNeighborhood === "all"
        ? groupedBusinesses
        : groupedBusinesses.filter((item) => item.neighborhood === effectiveSelectedNeighborhood);

    source.forEach((item) => {
      counts.set(item.groupedCategory, (counts.get(item.groupedCategory) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([group]) => group);
  }, [groupedBusinesses, effectiveSelectedNeighborhood]);

  const groupedSelectedCategory = selectedGroupedCategory;
  const effectiveSelectedCategory =
    groupedSelectedCategory === "all" || categories.includes(groupedSelectedCategory)
      ? groupedSelectedCategory
      : "all";

  const subcategoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    const source = groupedBusinesses.filter((item) => {
      const neighborhoodMatch =
        effectiveSelectedNeighborhood === "all" || item.neighborhood === effectiveSelectedNeighborhood;
      const categoryMatch =
        effectiveSelectedCategory === "all" || item.groupedCategory === effectiveSelectedCategory;
      return neighborhoodMatch && categoryMatch;
    });

    source.forEach((item) => {
      const label = item.subcategory ?? item.category;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({
        value,
        count,
        disabled: count < MIN_SUBCATEGORY_COUNT,
      }));
  }, [groupedBusinesses, effectiveSelectedNeighborhood, effectiveSelectedCategory, MIN_SUBCATEGORY_COUNT]);

  const selectableSubcategories = useMemo(
    () => subcategoryOptions.filter((item) => !item.disabled).map((item) => item.value),
    [subcategoryOptions],
  );

  const effectiveSelectedSubcategory =
    selectedSubcategory === "all" || selectableSubcategories.includes(selectedSubcategory)
      ? selectedSubcategory
      : "all";

  const filteredBusinesses = useMemo(() => {
    return groupedBusinesses.filter((item) => {
      const neighborhoodMatch =
        effectiveSelectedNeighborhood === "all" || item.neighborhood === effectiveSelectedNeighborhood;
      const categoryMatch =
        effectiveSelectedCategory === "all" || item.groupedCategory === effectiveSelectedCategory;
      const subcategoryLabel = item.subcategory ?? item.category;
      const subcategoryMatch =
        effectiveSelectedSubcategory === "all" || subcategoryLabel === effectiveSelectedSubcategory;
      const scoreMatch = item.score >= minScore;
      const commentsMatch =
        commentsFilter === "all" ||
        (commentsFilter === "with" && item.hasComments) ||
        (commentsFilter === "without" && !item.hasComments);
      const websiteMatch =
        websiteFilter === "all" ||
        (websiteFilter === "with" && item.hasWebsite) ||
        (websiteFilter === "without" && !item.hasWebsite);

      return neighborhoodMatch && categoryMatch && subcategoryMatch && scoreMatch && commentsMatch && websiteMatch;
    });
  }, [groupedBusinesses, effectiveSelectedNeighborhood, effectiveSelectedCategory, effectiveSelectedSubcategory, minScore, commentsFilter, websiteFilter]);

  const activeFilterCount =
    Number(effectiveSelectedNeighborhood !== "all") +
    Number(effectiveSelectedCategory !== "all") +
    Number(effectiveSelectedSubcategory !== "all") +
    Number(minScore > 0) +
    Number(commentsFilter !== "all") +
    Number(websiteFilter !== "all");

  const updateUrlFilters = useCallback(
    (next: {
      neighborhood?: string;
      category?: string;
      subcategory?: string;
      score?: number;
      comments?: "all" | "with" | "without";
      website?: "all" | "with" | "without";
    }) => {
      const neighborhood = next.neighborhood ?? effectiveSelectedNeighborhood;
      const category = next.category ?? effectiveSelectedCategory;
      const subcategory = next.subcategory ?? effectiveSelectedSubcategory;
      const score = next.score ?? minScore;
      const comments = next.comments ?? commentsFilter;
      const website = next.website ?? websiteFilter;

      const params = new URLSearchParams();
      if (neighborhood !== "all") {
        params.set("barrio", neighborhood);
      }
      if (category !== "all") {
        params.set("sector", category);
      }
      if (subcategory !== "all") {
        params.set("subgrupo", subcategory);
      }
      if (score > 0) {
        params.set("score_min", String(score));
      }
      if (comments !== "all") {
        params.set("comments", comments);
      }
      if (website !== "all") {
        params.set("website", website);
      }

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [
      commentsFilter,
      effectiveSelectedCategory,
      effectiveSelectedNeighborhood,
      effectiveSelectedSubcategory,
      minScore,
      pathname,
      router,
      websiteFilter,
    ],
  );

  useEffect(() => {
    const hasInvalidNeighborhood =
      selectedNeighborhood !== "all" && effectiveSelectedNeighborhood === "all";
    const hasInvalidCategory = selectedCategory !== "all" && effectiveSelectedCategory === "all";
    const hasInvalidSubcategory =
      selectedSubcategory !== "all" && effectiveSelectedSubcategory === "all";

    if (!hasInvalidNeighborhood && !hasInvalidCategory && !hasInvalidSubcategory) {
      return;
    }

    updateUrlFilters({
      neighborhood: effectiveSelectedNeighborhood,
      category: effectiveSelectedCategory,
      subcategory: effectiveSelectedSubcategory,
      score: minScore,
      comments: commentsFilter,
      website: websiteFilter,
    });
  }, [
    selectedNeighborhood,
    selectedCategory,
    selectedSubcategory,
    effectiveSelectedNeighborhood,
    effectiveSelectedCategory,
    effectiveSelectedSubcategory,
    minScore,
    commentsFilter,
    websiteFilter,
    updateUrlFilters,
  ]);

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
          tooltip="Numero de barrios que forman parte del analisis en la vista actual, despues de aplicar los filtros."
        />
        <MetricCard
          label="Negocios analizados"
          numericValue={filteredBusinesses.length}
          tooltip="Total de negocios evaluados y mostrados con la configuracion de filtros actual."
        />
        <MetricCard
          label="Score medio"
          numericValue={summary.avgScore}
          suffix="/100"
          toneClassName={summaryTheme.chipClassName}
          tooltip="Promedio del score de oportunidad de los negocios visibles. Se expresa en escala 0-100; valores mas altos indican mayor oportunidad."
          tooltipAlign="right"
        />
        <MetricCard
          label="Brecha media"
          numericValue={summary.avgGap}
          suffix=" pts"
          tooltip="Promedio del gap de los negocios visibles respecto a su objetivo o referencia. Se muestra en puntos (pts)."
          tooltipAlign="right"
        />
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
              {effectiveSelectedNeighborhood !== "all" && (
                <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-2 py-1 text-zinc-700">
                  Barrio: {effectiveSelectedNeighborhood}
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
               {effectiveSelectedCategory !== "all" && (
                 <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-2 py-1 text-zinc-700">
                   Sector: {effectiveSelectedCategory}
                    <button
                     type="button"
                     onClick={() => updateUrlFilters({ category: "all", subcategory: "all" })}
                     className="rounded-full px-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                     aria-label="Quitar filtro de sector"
                   >
                    x
                  </button>
                </span>
              )}
              {effectiveSelectedSubcategory !== "all" && (
                <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-2 py-1 text-zinc-700">
                  Subsector: {getSubsectorLabel(effectiveSelectedSubcategory)}
                  <button
                    type="button"
                    onClick={() => updateUrlFilters({ subcategory: "all" })}
                    className="rounded-full px-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                    aria-label="Quitar filtro de subsector"
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
              {commentsFilter !== "all" && (
                <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-2 py-1 text-zinc-700">
                  {commentsFilter === "with" ? "Solo con comentarios" : "Solo sin comentarios"}
                  <button
                    type="button"
                    onClick={() => updateUrlFilters({ comments: "all" })}
                    className="rounded-full px-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                    aria-label="Quitar filtro de comentarios"
                  >
                    x
                  </button>
                </span>
              )}
              {websiteFilter !== "all" && (
                <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-2 py-1 text-zinc-700">
                  {websiteFilter === "with" ? "Solo con web" : "Solo sin web"}
                  <button
                    type="button"
                    onClick={() => updateUrlFilters({ website: "all" })}
                    className="rounded-full px-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                    aria-label="Quitar filtro de web"
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
                updateUrlFilters({
                  neighborhood: "all",
                  category: "all",
                  subcategory: "all",
                  score: 0,
                  comments: "all",
                  website: "all",
                });
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

        <div className="mt-4 grid gap-4 md:grid-cols-6">
          <label className="flex flex-col gap-2 text-sm">
            <span className="font-semibold">Barrio</span>
            <select
              value={effectiveSelectedNeighborhood}
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
              value={effectiveSelectedCategory}
              onChange={(event) => {
                const value = event.target.value;
                updateUrlFilters({ category: value, subcategory: "all" });
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
            <span className="font-semibold">Subsector</span>
            <select
              value={effectiveSelectedSubcategory}
              onChange={(event) => {
                const value = event.target.value;
                updateUrlFilters({ subcategory: value });
              }}
              className="rounded-xl border border-line bg-white px-3 py-2"
            >
              <option value="all">Todos</option>
              {subcategoryOptions.map((item) => (
                <option key={item.value} value={item.value} disabled={item.disabled}>
                  {getSubsectorLabel(item.value)} ({item.count})
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

          <label className="flex flex-col gap-2 text-sm">
            <span className="font-semibold">Comentarios</span>
            <select
              value={commentsFilter}
              onChange={(event) => {
                const value =
                  event.target.value === "with" || event.target.value === "without"
                    ? event.target.value
                    : "all";
                updateUrlFilters({ comments: value });
              }}
              className="rounded-xl border border-line bg-white px-3 py-2"
            >
              <option value="all">Mostrar todos</option>
              <option value="with">Ocultar sin comentarios</option>
              <option value="without">Solo sin comentarios</option>
            </select>
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="font-semibold">Web</span>
            <select
              value={websiteFilter}
              onChange={(event) => {
                const value =
                  event.target.value === "with" || event.target.value === "without"
                    ? event.target.value
                    : "all";
                updateUrlFilters({ website: value });
              }}
              className="rounded-xl border border-line bg-white px-3 py-2"
            >
              <option value="all">Mostrar todos</option>
              <option value="without">Solo sin web</option>
              <option value="with">Solo con web</option>
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.45fr_1fr] h-[1fr]">
        <div className="h-fit overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
          <div className="flex items-center justify-between border-b border-line px-5 py-4 h-fit">
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
          <MapView
            businesses={mapBusinesses}
            selectedNeighborhood={effectiveSelectedNeighborhood}
          />
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
