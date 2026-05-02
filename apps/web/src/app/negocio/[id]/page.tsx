import Link from "next/link";

import { businesses } from "@/lib/mock-data";
import { getScoreTheme } from "@/lib/score-theme";

type BusinessDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function BusinessDetailPage({ params }: BusinessDetailPageProps) {
  const { id } = await params;
  const business = businesses.find((item) => item.id === id);

  if (!business) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-900">
          No se encontro el negocio solicitado.
        </div>
        <Link
          href="/"
          className="inline-flex w-fit rounded-full border border-line px-4 py-2 text-sm font-semibold hover:bg-zinc-100"
        >
          Volver al dashboard
        </Link>
      </div>
    );
  }

  const benchmark = {
    percentile: Math.max(10, 100 - business.gap),
    neighborhoodAvg: Math.max(0, business.score - 7),
    topQuartile: Math.min(100, business.score + business.gap),
  };

  const recommendations = [
    "Completa y unifica datos de contacto y horario en todos los canales.",
    "Publica 2 actualizaciones semanales con oferta clara y CTA local.",
    "Activa solicitud de resenas post-compra para subir volumen y calidad.",
  ];
  const scoreTheme = getScoreTheme(business.score);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-3xl border border-line bg-surface px-6 py-6 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">
          Ficha de negocio
        </p>
        <h1 className="mt-2 font-serif text-3xl leading-tight sm:text-4xl">{business.name}</h1>
        <p className="mt-2 text-sm text-zinc-700">
          {business.neighborhood} - {business.category}
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
