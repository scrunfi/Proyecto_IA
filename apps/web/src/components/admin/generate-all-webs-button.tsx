"use client";

import { useEffect, useState } from "react";

type JobResponse = {
  status?: string;
  job_id?: string;
  processed?: number;
  total_candidates?: number;
  queued?: number;
  errors?: number;
  params?: { batch_size?: number; only_missing_website?: boolean };
  error?: string;
  detail?: string;
};

const STORAGE_KEY = "web_generation_job_id";

function getStoredJobId() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(STORAGE_KEY) ?? "";
}

export function GenerateAllWebsButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [jobId, setJobId] = useState<string>("");
  const [jobStatus, setJobStatus] = useState<string>("idle");

  useEffect(() => {
    const stored = getStoredJobId();
    if (!stored) return;

    window.setTimeout(() => {
      setJobId(stored);
      setStatus("loading");
      setJobStatus("running");
      setMessage("Recuperando job en ejecucion...");
    }, 0);
  }, []);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch("/api/web-generation-job", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", job_id: jobId }),
        });
        const payload = (await response.json()) as JobResponse;
        if (!response.ok) {
          throw new Error(payload.detail || payload.error || "No se pudo consultar progreso");
        }

        const processed = payload.processed ?? 0;
        const total = payload.total_candidates ?? 0;
        const queued = payload.queued ?? 0;
        const errors = payload.errors ?? 0;
        const nextStatus = payload.status ?? "running";

        setJobStatus(nextStatus);
        if (total > 0) {
          setProgress(Math.min(100, Math.round((processed / total) * 100)));
        }

        if (nextStatus === "completed") {
          setStatus("ok");
          setProgress(100);
          setMessage(`Completado. Revisados ${processed}/${total || processed}. Encoladas: ${queued}, errores: ${errors}.`);
          setJobId("");
          window.localStorage.removeItem(STORAGE_KEY);
          return;
        }

        if (nextStatus === "cancelled") {
          setStatus("idle");
          setMessage(`Proceso cancelado. Revisados ${processed}/${total || processed}. Encoladas: ${queued}, errores: ${errors}.`);
          setJobId("");
          window.localStorage.removeItem(STORAGE_KEY);
          return;
        }

        setMessage(`Progreso: ${processed}/${total || "?"}. Encoladas: ${queued}, errores: ${errors}.`);
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Error desconocido");
        setJobStatus("error");
        setJobId("");
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }

      if (!cancelled) {
        window.setTimeout(poll, 2000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  async function handleClick() {
    setStatus("loading");
    setMessage("");
    setProgress(0);
    setJobStatus("starting");

    try {
      const response = await fetch("/api/web-generation-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const payload = (await response.json()) as JobResponse;
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "No se pudo iniciar generacion masiva");
      }

      const nextJobId = payload.job_id;
      if (!nextJobId) {
        throw new Error("No se recibio job_id del backend");
      }

      setJobId(nextJobId);
      window.localStorage.setItem(STORAGE_KEY, nextJobId);
      setJobStatus("running");
      if (payload.status === "already_running") {
        setMessage("Ya habia un job en ejecucion. Reutilizando job activo...");
      } else {
        setMessage("Job iniciado. Preparando progreso...");
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Error desconocido");
      setJobStatus("error");
    }
  }

  function handleCancel() {
    if (status !== "loading" || !jobId) return;
    fetch("/api/web-generation-job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", job_id: jobId }),
    }).catch(() => null);
    setMessage("Cancelando proceso...");
    setJobStatus("cancelling");
  }

  function getStatusTone(value: string) {
    if (value === "running" || value === "starting") return "bg-sky-100 text-sky-800";
    if (value === "cancelling" || value === "cancelled") return "bg-amber-100 text-amber-800";
    if (value === "completed") return "bg-emerald-100 text-emerald-800";
    if (value === "error") return "bg-rose-100 text-rose-800";
    return "bg-zinc-100 text-zinc-700";
  }

  function getStatusLabel(value: string) {
    if (value === "starting") return "Iniciando";
    if (value === "running") return "En ejecucion";
    if (value === "cancelling") return "Cancelando";
    if (value === "cancelled") return "Cancelado";
    if (value === "completed") return "Completado";
    if (value === "error") return "Error";
    return "En espera";
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleClick}
          disabled={status === "loading"}
          className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "Generando webs..." : "Generar webs faltantes"}
        </button>
        {status === "loading" ? (
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-full border border-line bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
          >
            Cancelar
          </button>
        ) : null}
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${getStatusTone(jobStatus)}`}>
          Estado: {getStatusLabel(jobStatus)}
        </span>
      </div>
      {status === "loading" ? (
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
          <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      {message ? <p className={`text-xs ${status === "error" ? "text-red-700" : "text-zinc-600"}`}>{message}</p> : null}
      {jobId ? (
        <p className="text-[11px] text-zinc-500">
          job_id: {jobId} | backend_status: {jobStatus}
        </p>
      ) : null}
    </div>
  );
}
