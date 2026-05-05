import Link from "next/link";
import { notFound } from "next/navigation";

import { backendFetch } from "@/lib/backend-client";
import { toBusiness } from "@/lib/business-adapter";
import { getScoreTheme } from "@/lib/score-theme";

type BusinessDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function BusinessDetailPage({ params }: BusinessDetailPageProps) {
  const { id } = await params;
  let business: ReturnType<typeof toBusiness>;
  let benchmark = {
    percentile: 0,
    neighborhoodAvg: 0,
    topQuartile: 0,
  };
  let recommendations: string[] = [];

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
    }>(`/shops/id/${id}/detail`);
    business = toBusiness(detail.business);
    benchmark = detail.benchmark;
    recommendations = detail.recommendations;
  } catch {
    notFound();
  }

  const scoreTheme = getScoreTheme(business.score);
  const sectorLabel = business.subcategory ?? business.category;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-3xl border border-line bg-surface px-6 py-6 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">
          Ficha de negocio
        </p>
        <h1 className="mt-2 font-serif text-3xl leading-tight sm:text-4xl">{business.name}</h1>
        <p className="mt-2 text-sm text-zinc-700">
          {business.neighborhood} - {sectorLabel}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill
            label={`Score ${business.score}/100`}
            className={`${scoreTheme.chipClassName} border ${scoreTheme.borderClassName}`}
          />
          <Pill label={`Gap ${business.gap} pts`} />
          <Pill label={`${business.reviews} resenas`} />
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Percentil local" value={`${benchmark.percentile}`} />
        <Metric label="Media del barrio" value={`${benchmark.neighborhoodAvg}`} />
        <Metric label="Top quartile" value={`${benchmark.topQuartile}`} />
      </section>

      <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="font-semibold">Top acciones recomendadas</h2>
        <ol className="mt-3 space-y-2 text-sm text-zinc-700">
          {recommendations.map((item, index) => (
            <li key={item} className="rounded-xl border border-line bg-surface-2 px-3 py-2">
              <span className="mr-2 font-semibold text-accent">{index + 1}.</span>
              {item}
            </li>
          ))}
        </ol>
      </section>

      <div>
        <Link
          href="/"
          className="inline-flex rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-zinc-100"
        >
          Volver al dashboard
        </Link>
      </div>
    </div>
  );
}

function Pill({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={`rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent ${className ?? ""}`}
    >
      {label}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
      <p className="text-xs text-zinc-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </article>
  );
}
