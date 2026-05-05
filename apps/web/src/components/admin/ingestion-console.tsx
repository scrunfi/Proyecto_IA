"use client";

import { useState } from "react";

import { backendFetch } from "@/lib/backend-client";

type IngestionResponse = {
  businesses: Array<{ id: string; score: number; gap: number }>;
  neighborhoods: string[];
  generatedAt: string;
};

const starterPayload = {
  businesses: [],
};

export function IngestionConsole() {
  const [sourceType, setSourceType] = useState<"manual" | "places" | "municipal">("manual");
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [payload, setPayload] = useState(JSON.stringify(starterPayload, null, 2));
  const [result, setResult] = useState<IngestionResponse | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [error, setError] = useState("");

  async function handleIngest() {
    setStatus("loading");
    setError("");
    try {
      const parsed = JSON.parse(payload) as { businesses: unknown[] };
      const data = await backendFetch<IngestionResponse>("/ingesta/inicial", {
        method: "POST",
        body: JSON.stringify(parsed),
      });
      setResult(data);
      setStatus("ok");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "No se pudo ejecutar la ingesta.");
    }
  }

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="font-semibold">Configuracion de ingesta inicial</h2>
      <p className="mt-1 text-sm text-zinc-600">Carga el dataset base de los 5 barrios para iniciar scoring y entrenamientos.</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Fuente de ingesta</span>
          <select
            value={sourceType}
            onChange={(event) => {
              setSourceType(event.target.value as "manual" | "places" | "municipal");
            }}
            className="rounded-xl border border-line bg-white px-3 py-2"
          >
            <option value="manual">Manual (JSON/CSV transformado)</option>
            <option value="places">Google Places (preprocesado)</option>
            <option value="municipal">Portal municipal/INE (preprocesado)</option>
          </select>
        </label>

        <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={replaceExisting}
            onChange={(event) => {
              setReplaceExisting(event.target.checked);
            }}
          />
          Reemplazar dataset existente
        </label>
      </div>

      <label className="mt-4 flex flex-col gap-2 text-sm">
        <span className="font-semibold">Payload JSON</span>
        <textarea
          value={payload}
          onChange={(event) => {
            setPayload(event.target.value);
          }}
          rows={16}
          className="w-full rounded-xl border border-line bg-white p-3 font-mono text-xs"
        />
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleIngest}
          disabled={status === "loading"}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "Procesando..." : "Ejecutar ingesta"}
        </button>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
          Fuente: {sourceType} | Modo: {replaceExisting ? "replace" : "append"}
        </span>
      </div>

      {status === "error" && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {result && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Metric label="Negocios procesados" value={String(result.businesses.length)} />
          <Metric label="Barrios detectados" value={String(result.neighborhoods.length)} />
          <Metric label="Generado" value={new Date(result.generatedAt).toLocaleString()} />
        </div>
      )}
    </section>
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
