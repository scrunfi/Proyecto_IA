"use client";

import { useState } from "react";

import { backendFetch } from "@/lib/backend-client";

type TrainingResponse = {
  version: string;
  trained_at: string;
  records: number;
};

const modelOptions = [
  { value: "rules_v1", label: "Rules v1 (baseline)" },
  { value: "xgboost", label: "XGBoost (tabular)" },
  { value: "lightgbm", label: "LightGBM (tabular)" },
];

export function TrainingConsole() {
  const [modelType, setModelType] = useState("rules_v1");
  const [validationMode, setValidationMode] = useState("holdout_80_20");
  const [epochs, setEpochs] = useState(30);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<TrainingResponse | null>(null);

  async function handleTrain() {
    setStatus("loading");
    setError("");
    try {
      const data = await backendFetch<TrainingResponse>("/modelo/entrenar", {
        method: "POST",
        body: JSON.stringify({ modelType, validationMode, epochs }),
      });
      setResult(data);
      setStatus("ok");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "No se pudo entrenar el modelo.");
    }
  }

  return (
    <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="font-semibold">Entrenamiento de modelo</h2>
      <p className="mt-1 text-sm text-zinc-600">Selecciona estrategia y ejecuta una nueva version del modelo para recomendaciones.</p>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Tipo de modelo</span>
          <select
            value={modelType}
            onChange={(event) => {
              setModelType(event.target.value);
            }}
            className="rounded-xl border border-line bg-white px-3 py-2"
          >
            {modelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Validacion</span>
          <select
            value={validationMode}
            onChange={(event) => {
              setValidationMode(event.target.value);
            }}
            className="rounded-xl border border-line bg-white px-3 py-2"
          >
            <option value="holdout_80_20">Holdout 80/20</option>
            <option value="kfold_5">K-Fold (5)</option>
            <option value="time_split">Time split</option>
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Epocas</span>
          <input
            type="number"
            min={1}
            max={300}
            value={epochs}
            onChange={(event) => {
              const next = Number(event.target.value);
              setEpochs(Number.isNaN(next) ? 30 : next);
            }}
            className="rounded-xl border border-line bg-white px-3 py-2"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleTrain}
          disabled={status === "loading"}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "Entrenando..." : "Entrenar modelo"}
        </button>
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
          {modelType} | {validationMode}
        </span>
      </div>

      {status === "error" && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {result && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Metric label="Version" value={result.version} />
          <Metric label="Registros" value={String(result.records)} />
          <Metric label="Entrenado" value={new Date(result.trained_at).toLocaleString()} />
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
