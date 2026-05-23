import type { NextApiRequest, NextApiResponse } from "next";

type ChatApiResponse =
  | {
      reply: string;
      raw?: unknown;
    }
  | {
      error: string;
      detail?: string;
    };

const DEFAULT_CHAT_WEBHOOK_URL = "http://n8n:5678/webhook/f5e986ec-8ab3-4964-a2f4-c9569c64f1d1";

function getWebhookUrl() {
  return process.env.N8N_CHAT_WEBHOOK_URL ?? DEFAULT_CHAT_WEBHOOK_URL;
}

function extractReply(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === "string") return payload;

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const value = extractReply(item);
      if (value) return value;
    }
    return null;
  }

  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    const directKeys = ["output", "response", "reply", "answer", "text", "message"];
    for (const key of directKeys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value;
    }

    if (Array.isArray(record.messages)) {
      for (const message of record.messages) {
        if (typeof message === "string" && message.trim()) return message;
        if (message && typeof message === "object") {
          const text = (message as Record<string, unknown>).content;
          if (typeof text === "string" && text.trim()) return text;
        }
      }
    }

    const nestedKeys = ["data", "result"];
    for (const key of nestedKeys) {
      const value = extractReply(record[key]);
      if (value) return value;
    }
  }

  return null;
}

function buildChatInput(params: {
  message: string;
  context: "home" | "business";
  businessName?: string;
  businessNeighborhood?: string;
  businessSector?: string;
}) {
  const { message, context, businessName, businessNeighborhood, businessSector } = params;
  if (context !== "business") {
    return message;
  }

  const focusedBusiness = businessName?.trim() || "Negocio seleccionado";
  const neighborhood = businessNeighborhood?.trim() || "Barrio no especificado";
  const sector = businessSector?.trim() || "Sector no especificado";

  return [
    "[MODO CONTEXTO DE NEGOCIO]",
    "Responde siempre centrado en el negocio seleccionado.",
    `Negocio: ${focusedBusiness}`,
    `Barrio: ${neighborhood}`,
    `Sector: ${sector}`,
    "Si falta dato exacto, indica supuesto breve y da accion concreta.",
    `Pregunta del usuario: ${message}`,
  ].join("\n");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ChatApiResponse>) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const { message, context, businessId, businessName, businessNeighborhood, businessSector, sessionId } = req.body ?? {};

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Falta el mensaje del usuario" });
  }

  const normalizedContext = context === "business" ? "business" : "home";
  const chatInput = buildChatInput({
    message: message.trim(),
    context: normalizedContext,
    businessName: typeof businessName === "string" ? businessName : undefined,
    businessNeighborhood: typeof businessNeighborhood === "string" ? businessNeighborhood : undefined,
    businessSector: typeof businessSector === "string" ? businessSector : undefined,
  });

  const controller = new AbortController();
  const timeoutMs = Number(process.env.N8N_CHAT_TIMEOUT_MS ?? "45000");
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 45000;
  const timeoutHandle = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(getWebhookUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chatInput,
        message: message.trim(),
        sessionId:
          typeof sessionId === "string" && sessionId.trim() ? sessionId : `session-${Date.now().toString(36)}`,
        context: {
          scope: normalizedContext,
          businessId: typeof businessId === "string" ? businessId : undefined,
          businessName: typeof businessName === "string" ? businessName : undefined,
          businessNeighborhood:
            typeof businessNeighborhood === "string" ? businessNeighborhood : undefined,
          businessSector: typeof businessSector === "string" ? businessSector : undefined,
        },
      }),
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.toLowerCase().includes("application/json");
    const payload = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const detail = typeof payload === "string" ? payload : JSON.stringify(payload);
      return res.status(response.status).json({ error: "n8n devolvio un error", detail: detail.slice(0, 500) });
    }

    const reply = extractReply(payload);
    if (!reply) {
      return res.status(502).json({ error: "n8n respondio sin texto util", detail: JSON.stringify(payload).slice(0, 500) });
    }

    return res.status(200).json({ reply, raw: payload });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return res.status(504).json({
        error: "Timeout esperando respuesta de n8n",
        detail:
          "El flujo sigue ejecutandose en segundo plano. Prueba de nuevo en unos segundos o aumenta N8N_CHAT_TIMEOUT_MS.",
      });
    }

    const detail = error instanceof Error ? error.message : "Error desconocido";
    return res.status(500).json({ error: "No se pudo conectar con n8n", detail });
  } finally {
    clearTimeout(timeoutHandle);
  }
}
