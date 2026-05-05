"use client";

import { useState } from "react";

import { backendFetch } from "@/lib/backend-client";

type RecalcResponse = {
  businesses: Array<{ id: string; score: number; gap: number; barrio: string }>;
  neighborhoods: string[];
  generatedAt: string;
};

export function EtlConsole() {
  const [normalizeFields, setNormalizeFields] = useState(true);
  const [recalculateBenchmarks, setRecalculateBenchmarks] = useState(true);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<RecalcResponse | null>(null);

  async function handleRunEtl() {
    setStatus("loading");
    setError("");
    try {
      const data = await backendFetch<RecalcResponse>("/features/recalcular", {
        method: "POST",
      });
      setResult(data);
      setStatus("ok");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "No se pudo ejecutar el ETL.");
    }
  }

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="font-semibold">Pipeline ETL y recalculo</h2>
      <p className="mt-1 text-sm text-zinc-600">Ejecuta transformaciones para dejar score, gap y benchmarks alineados antes de entrenar.</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Toggle
          label="Normalizar campos"
          description="Estandariza tipos y rangos antes de recalcular."
          checked={normalizeFields}
          onChange={setNormalizeFields}
        />
        <Toggle
          label="Recalcular benchmark sectorial"
          description="Actualiza objetivo por sector y gap derivado."
          checked={recalculateBenchmarks}
          onChange={setRecalculateBenchmarks}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleRunEtl}
          disabled={status === "loading"}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "Ejecutando..." : "Ejecutar ETL"}
        </button>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
          Normalizacion: {normalizeFields ? "on" : "off"} | Benchmark: {recalculateBenchmarks ? "on" : "off"}
        </span>
      </div>

      {status === "error" && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {result && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Metric label="Registros recalculados" value={String(result.businesses.length)} />
          <Metric label="Barrios" value={String(result.neighborhoods.length)} />
          <Metric label="Ultima ejecucion" value={new Date(result.generatedAt).toLocaleString()} />
        </div>
      )}
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 rounded-xl border border-line bg-white px-3 py-3 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="text-zinc-600">{description}</span>
      </span>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-line bg-surface-2 px-3 py-2">
      <p className="text-xs text-zinc-600">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </article>
  );
}
