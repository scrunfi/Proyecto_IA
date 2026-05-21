"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type AiAnalysisButtonProps = {
  businessId: string;
  hasExistingAnalysis: boolean;
};

type ApiPayload = {
  error?: string;
  detail?: string;
};

export function AiAnalysisButton({ businessId, hasExistingAnalysis }: AiAnalysisButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function handleGenerate() {
    setStatus("loading");
    setMessage("");

    try {
      const response = await fetch("/api/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_id: businessId,
          force_refresh: hasExistingAnalysis,
        }),
      });

      const payload = (await readJsonSafe(response)) as ApiPayload;
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "No se pudo generar el analisis IA");
      }

      setStatus("ok");
      setMessage(hasExistingAnalysis ? "Analisis IA regenerado correctamente." : "Analisis IA generado correctamente.");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Error desconocido");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={status === "loading"}
        className="rounded-full border border-line bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "loading"
          ? hasExistingAnalysis
            ? "Regenerando..."
            : "Generando..."
          : hasExistingAnalysis
            ? "Regenerar analisis IA"
            : "Generar analisis IA"}
      </button>
      {message ? <span className={`text-xs ${status === "error" ? "text-red-700" : "text-zinc-600"}`}>{message}</span> : null}
    </div>
  );
}

async function readJsonSafe(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { detail: raw.slice(0, 280) };
  }
}
