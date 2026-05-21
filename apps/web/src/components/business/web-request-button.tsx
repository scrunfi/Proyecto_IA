"use client";

import { useEffect, useState } from "react";

type WebRequestButtonProps = {
  businessId: string;
};

type ApiPayload = {
  status?: string;
  request_id?: string;
  error?: string;
  detail?: string;
  updated_at?: string;
  response?: unknown;
};

export function WebRequestButton({ businessId }: WebRequestButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "ok") return;
    if (!message.includes("Ultima solicitud: processing")) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const refreshLatest = async () => {
      try {
        const response = await fetch("/api/web-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "latest", shop_id: businessId }),
        });
        const payload = (await readJsonSafe(response)) as ApiPayload;
        if (!response.ok || cancelled) return;

        const latestStatus = payload.status ?? "desconocido";
        const baseMessage = `Ultima solicitud: ${latestStatus} · request_id: ${payload.request_id ?? "-"} · updated_at: ${payload.updated_at ?? "-"}`;
        setMessage(payload.error ? `${baseMessage} · error: ${payload.error}` : baseMessage);
        setPreviewUrl(findPreviewUrl(payload.response));
        setPreviewHtml(findPreviewHtml(payload.response));

        if (latestStatus === "sent") {
          setProgress(100);
        }

        if (latestStatus !== "processing" && latestStatus !== "queued") {
          if (intervalId) clearInterval(intervalId);
        }
      } catch {
        // Ignorar errores puntuales durante auto refresh.
      }
    };

    intervalId = setInterval(refreshLatest, 5000);
    void refreshLatest();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [businessId, message, status]);

  async function handleCreate() {
    setStatus("loading");
    setMessage("");
    setProgress(5);
    setPreviewUrl(null);
    setPreviewHtml(null);
    try {
      setMessage("Encolando solicitud...");
      const response = await fetch("/api/web-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", shop_id: businessId }),
      });
      const payload = (await readJsonSafe(response)) as ApiPayload;
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "No se pudo crear solicitud");
      }

      const reqId = payload.request_id ?? "-";
      setProgress(30);
      setMessage(`Solicitud enviada a n8n. request_id: ${reqId}. Esperando generacion...`);

      const latest = await waitForWebGeneration(businessId, reqId, setProgress);
      const generatedPreview = findPreviewUrl(latest.response);
      const generatedHtml = findPreviewHtml(latest.response);

      setStatus("ok");
      setProgress(100);
      setPreviewUrl(generatedPreview);
      setPreviewHtml(generatedHtml);
      setMessage(
        generatedPreview || generatedHtml
          ? `Web generada correctamente. request_id: ${latest.request_id ?? reqId}`
          : `Proceso finalizado. request_id: ${latest.request_id ?? reqId}`,
      );
    } catch (error) {
      setStatus("error");
      setProgress(0);
      setMessage(error instanceof Error ? error.message : "Error desconocido");
    }
  }

  async function handleLatest() {
    setStatus("loading");
    setMessage("");
    setProgress(10);
    try {
      const response = await fetch("/api/web-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "latest", shop_id: businessId }),
      });
      const payload = (await readJsonSafe(response)) as ApiPayload;
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "No se pudo consultar estado");
      }
      setStatus("ok");
      setProgress(payload.status === "sent" ? 100 : 60);
      setPreviewUrl(findPreviewUrl(payload.response));
      setPreviewHtml(findPreviewHtml(payload.response));
      const baseMessage = `Ultima solicitud: ${payload.status ?? "desconocido"} · request_id: ${payload.request_id ?? "-"} · updated_at: ${payload.updated_at ?? "-"}`;
      setMessage(payload.error ? `${baseMessage} · error: ${payload.error}` : baseMessage);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Error desconocido");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleCreate}
        disabled={status === "loading"}
        className="rounded-full border border-line bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "loading" ? "Enviando..." : "Solicitar web (n8n)"}
      </button>
      <button
        type="button"
        onClick={handleLatest}
        disabled={status === "loading"}
        className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Ver ultimo estado
      </button>
      {status === "loading" ? (
        <span className="inline-flex items-center rounded-full border border-line bg-white px-2 py-1 text-xs font-semibold text-zinc-700">
          Progreso: {progress}%
        </span>
      ) : null}
      {previewUrl ? (
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          Previsualizar web
        </a>
      ) : null}
      {!previewUrl && previewHtml ? (
        <button
          type="button"
          onClick={() => openHtmlPreview(previewHtml)}
          className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
        >
          Previsualizar HTML
        </button>
      ) : null}
      {message ? (
        <span className={`text-xs ${status === "error" ? "text-red-700" : "text-zinc-600"}`}>{message}</span>
      ) : null}
    </div>
  );
}

async function waitForWebGeneration(
  businessId: string,
  requestId: string,
  setProgress: (value: number) => void,
): Promise<ApiPayload> {
  const maxAttempts = 20;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await sleep(1500);
    let payload: ApiPayload;
    try {
      const response = await fetch("/api/web-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "latest", shop_id: businessId }),
      });

      payload = (await readJsonSafe(response)) as ApiPayload;
      if (!response.ok) {
        throw new Error(payload.detail || payload.error || "No se pudo consultar estado de la generacion");
      }
    } catch {
      const computedProgress = Math.min(90, 30 + Math.round((attempt / maxAttempts) * 60));
      setProgress(computedProgress);
      continue;
    }

    const computedProgress = Math.min(95, 30 + Math.round((attempt / maxAttempts) * 65));
    setProgress(computedProgress);

    if (payload.status === "error") {
      throw new Error(payload.error || payload.detail || "n8n devolvio error en la generacion");
    }

    if (payload.status === "sent" && (requestId === "-" || payload.request_id === requestId)) {
      return payload;
    }
  }

  throw new Error("La generacion sigue en curso. Vuelve a consultar en unos segundos.");
}

function findPreviewUrl(value: unknown): string | null {
  const direct = findHttpUrl(value);
  if (!direct) return null;
  return direct;
}

function findPreviewHtml(value: unknown): string | null {
  const html = findHtmlString(value);
  if (!html) return null;
  const trimmed = html.trim();
  if (!trimmed) return null;
  return trimmed;
}

function findHtmlString(value: unknown): string | null {
  if (typeof value === "string") {
    const parsed = tryParseJson(value.trim());
    if (parsed) {
      const fromParsed = findHtmlString(parsed);
      if (fromParsed) return fromParsed;
    }
    if (/<!doctype html|<html[\s>]|<body[\s>]/i.test(value)) return value;
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findHtmlString(item);
      if (found) return found;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const mimeType = typeof raw.mimeType === "string" ? raw.mimeType.toLowerCase() : "";
  const base64Data = typeof raw.data === "string" ? raw.data : null;
  if (base64Data && (mimeType.includes("text/html") || mimeType.includes("application/xhtml+xml"))) {
    const decoded = decodeBase64ToText(base64Data);
    if (decoded && /<!doctype html|<html[\s>]|<body[\s>]/i.test(decoded)) {
      return decoded;
    }
  }

  const preferredKeys = ["html", "output", "content", "page_html", "generated_html"];
  for (const key of preferredKeys) {
    const found = findHtmlString(raw[key]);
    if (found) return found;
  }

  for (const nested of Object.values(raw)) {
    const found = findHtmlString(nested);
    if (found) return found;
  }

  return null;
}

function decodeBase64ToText(base64: string): string | null {
  try {
    const normalized = base64.replace(/\s+/g, "");
    return atob(normalized);
  } catch {
    return null;
  }
}

function openHtmlPreview(html: string): void {
  const previewWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!previewWindow) return;

  previewWindow.document.open();
  previewWindow.document.write(html);
  previewWindow.document.close();
}

function findHttpUrl(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = tryParseJson(trimmed);
    if (parsed) {
      const fromParsed = findHttpUrl(parsed);
      if (fromParsed) return fromParsed;
    }
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    const embeddedMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
    return embeddedMatch ? embeddedMatch[0] : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findHttpUrl(item);
      if (found) return found;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const preferredKeys = [
    "preview_url",
    "previewUrl",
    "url",
    "website_url",
    "websiteUrl",
    "link",
    "web_url",
  ];

  for (const key of preferredKeys) {
    const found = findHttpUrl(raw[key]);
    if (found) return found;
  }

  for (const nested of Object.values(raw)) {
    const found = findHttpUrl(nested);
    if (found) return found;
  }

  return null;
}

function tryParseJson(raw: string): unknown | null {
  if (!raw) return null;
  if (!(raw.startsWith("{") || raw.startsWith("["))) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
