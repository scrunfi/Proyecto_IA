import type { NextApiRequest, NextApiResponse } from "next";

import { backendFetch } from "@/lib/backend-client";

type ChatApiResponse =
  | {
      reply: string;
      raw?: unknown;
    }
  | {
      error: string;
      detail?: string;
    };

type NearbyBusinessContext = {
  name: string;
  score: number;
  sector: string;
};

type ChatHistoryItem = {
  role: "assistant" | "user";
  text: string;
};

type BackendShop = {
  _id: string;
  name?: string;
  category?: string;
  subcategory?: string;
  score?: number;
  reviews?: number;
  has_website?: boolean;
  barrio?: { name?: string };
};

type ShopsResponse = {
  total: number;
  shops: BackendShop[];
};

const DEFAULT_CHAT_WEBHOOK_URL = "http://n8n:5678/webhook/f5e986ec-8ab3-4964-a2f4-c9569c64f1d1";

const CLOTHING_SUBCATEGORIES = new Set([
  "clothes",
  "fashion",
  "boutique",
  "shoes",
  "baby_goods",
  "bag",
  "bags",
  "jewelry",
  "jewellery",
  "accessories",
  "tailor",
]);

const PLACE_ALIASES: Array<{ label: string; match: RegExp; barrio: string }> = [
  { label: "Roquetas de Mar", match: /\broquetas(?:\s+de\s+mar)?\b/i, barrio: "Roquetas de Mar" },
  { label: "Almeria", match: /\balmer[ií]a\b/i, barrio: "Almeria" },
  { label: "Huercal de Almeria", match: /\bhu[eé]rcal(?:\s+de\s+almer[ií]a)?\b/i, barrio: "Huercal de Almeria" },
  { label: "Viator", match: /\bviator\b/i, barrio: "Viator" },
  { label: "La Canada y El Alquian", match: /\b(?:la\s+ca[nñ]ada|el\s+alqui[aá]n)\b/i, barrio: "La Canada y El Alquian" },
];

function getWebhookUrl() {
  return process.env.N8N_CHAT_WEBHOOK_URL ?? DEFAULT_CHAT_WEBHOOK_URL;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function detectPlace(message: string) {
  return PLACE_ALIASES.find((item) => item.match.test(message));
}

function isClothingQuery(message: string) {
  const normalized = normalizeText(message);
  return /\b(ropa|moda|boutique|zapater[ií]a|zapatos|textil|infantil)\b/i.test(normalized);
}

function isCountQuery(message: string) {
  const normalized = normalizeText(message);
  return /\b(cuant[oa]s?|numero|cantidad|total)\b/i.test(normalized);
}

function isBestScoreQuery(message: string) {
  const normalized = normalizeText(message);
  return /\b(mejor|mayor|top|ranking|mas alto|highest)\b/i.test(normalized) && /\bscore|puntuacion\b/i.test(normalized);
}

function isClothingShop(shop: BackendShop) {
  const category = normalizeText(shop.category ?? "");
  const subcategory = normalizeText(shop.subcategory ?? "");
  const name = normalizeText(shop.name ?? "");

  return (
    CLOTHING_SUBCATEGORIES.has(subcategory) ||
    /\b(ropa|moda|boutique|zapater|calzado|textil|confeccion|infantil)\b/i.test(name) ||
    (category === "comercio" && /\b(clothes|fashion|shoes|boutique|baby_goods)\b/i.test(subcategory))
  );
}

function formatShopLine(shop: BackendShop, index: number) {
  const score = typeof shop.score === "number" ? `${shop.score}/100` : "sin score";
  const place = shop.barrio?.name ? `, ${shop.barrio.name}` : "";
  const sector = shop.subcategory || shop.category || "sector no especificado";
  return `${index + 1}. ${shop.name ?? "Negocio sin nombre"} - Score ${score} - ${sector}${place}`;
}

async function fetchActiveShops(params: URLSearchParams) {
  const allShops: BackendShop[] = [];
  let total = Number.POSITIVE_INFINITY;
  const pageSize = 5000;

  params.set("limit", String(pageSize));
  params.set("active_only", "true");

  while (allShops.length < total) {
    params.set("skip", String(allShops.length));
    const payload = await backendFetch<ShopsResponse>(`/shops?${params.toString()}`);
    total = payload.total;

    if (!payload.shops.length) break;
    allShops.push(...payload.shops);
  }

  return allShops;
}

async function answerDeterministicBusinessQuestion(message: string): Promise<string | null> {
  const place = detectPlace(message);
  const params = new URLSearchParams({ min_score: "0" });
  if (place) params.set("barrio", place.barrio);

  if (isBestScoreQuery(message)) {
    const shops = await fetchActiveShops(params);
    const ranked = shops
      .filter((shop) => typeof shop.score === "number")
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

    const best = ranked[0];
    if (!best) {
      return `No he encontrado negocios con score${place ? ` en ${place.label}` : ""} en la base de datos.`;
    }

    const locationText = place ? ` en ${place.label}` : "";
    const topLines = ranked.slice(0, 5).map(formatShopLine).join("\n");
    return [
      `El negocio con mejor score${locationText} es ${best.name ?? "Negocio sin nombre"}, con ${best.score}/100.`,
      `Sector: ${best.subcategory || best.category || "no especificado"}.`,
      `Top 5 por score${locationText}:`,
      topLines,
    ].join("\n");
  }

  if (isCountQuery(message) && isClothingQuery(message)) {
    const shops = await fetchActiveShops(params);
    const matches = shops.filter(isClothingShop).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    const locationText = place ? ` en ${place.label}` : " en la zona analizada";

    if (!matches.length) {
      return `No he encontrado negocios de moda o ropa${locationText} en la base de datos actual. Puede deberse a que OSM los tenga clasificados con otra subcategoria o a que falten datos de ingesta.`;
    }

    const sampleLines = matches.slice(0, 5).map(formatShopLine).join("\n");
    return [
      `Hay ${matches.length} negocios de moda o ropa${locationText} en la base de datos actual.`,
      "Los mejor posicionados por score son:",
      sampleLines,
    ].join("\n");
  }

  return null;
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
  nearbyBusinesses?: NearbyBusinessContext[];
  history?: ChatHistoryItem[];
}) {
  const { message, context, businessName, businessNeighborhood, businessSector, nearbyBusinesses, history } = params;
  const formatInstructions = [
    "Formato de respuesta:",
    "No uses Markdown ni asteriscos.",
    "Separa cada parrafo con un salto de linea.",
    "Usa texto claro y directo.",
  ].join("\n");

  const historyLines = history?.length
    ? ["Historial reciente:", ...history.map((item) => `${item.role === "user" ? "Usuario" : "Asistente"}: ${item.text}`)]
    : [];

  if (context !== "business") {
    return [formatInstructions, ...historyLines, `Pregunta del usuario: ${message}`].join("\n\n");
  }

  const focusedBusiness = businessName?.trim() || "Negocio seleccionado";
  const neighborhood = businessNeighborhood?.trim() || "Barrio no especificado";
  const sector = businessSector?.trim() || "Sector no especificado";
  const nearbyBusinessLines = nearbyBusinesses?.length
    ? nearbyBusinesses.map(
        (item, index) => `${index + 1}. ${item.name} | Score: ${item.score}/100 | Sector: ${item.sector}`,
      )
    : ["No se recibieron negocios cercanos comparables."];

  return [
    "[MODO CONTEXTO DE NEGOCIO]",
    "Responde siempre centrado en el negocio seleccionado.",
    formatInstructions,
    `Negocio: ${focusedBusiness}`,
    `Barrio: ${neighborhood}`,
    `Sector: ${sector}`,
    "Negocios cercanos comparables:",
    ...nearbyBusinessLines,
    ...historyLines,
    "Si falta dato exacto, indica supuesto breve y da accion concreta.",
    `Pregunta del usuario: ${message}`,
  ].join("\n");
}

function normalizeHistory(value: unknown): ChatHistoryItem[] | undefined {
  if (!Array.isArray(value)) return undefined;

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const role = record.role === "assistant" || record.role === "user" ? record.role : null;
      const text = typeof record.text === "string" ? record.text.trim() : "";
      if (!role || !text) return null;
      return { role, text };
    })
    .filter((item): item is ChatHistoryItem => item !== null)
    .slice(-6);
}

function normalizeNearbyBusinesses(value: unknown): NearbyBusinessContext[] | undefined {
  if (!Array.isArray(value)) return undefined;

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      const score = typeof record.score === "number" && Number.isFinite(record.score) ? record.score : null;
      const sector = typeof record.sector === "string" ? record.sector.trim() : "";

      if (!name || score === null || !sector) return null;
      return { name, score, sector };
    })
    .filter((item): item is NearbyBusinessContext => item !== null)
    .slice(0, 12);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ChatApiResponse>) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo no permitido" });
  }

  const {
    message,
    context,
    businessId,
    businessName,
    businessNeighborhood,
    businessSector,
    nearbyBusinesses,
    history,
    sessionId,
  } = req.body ?? {};

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Falta el mensaje del usuario" });
  }

  const normalizedContext = context === "business" ? "business" : "home";
  const normalizedNearbyBusinesses = normalizeNearbyBusinesses(nearbyBusinesses);
  const normalizedHistory = normalizeHistory(history);

  if (normalizedContext === "home") {
    try {
      const deterministicReply = await answerDeterministicBusinessQuestion(message.trim());
      if (deterministicReply) {
        return res.status(200).json({ reply: deterministicReply });
      }
    } catch {
      // If the business API is unavailable, keep the existing n8n fallback behavior.
    }
  }

  const chatInput = buildChatInput({
    message: message.trim(),
    context: normalizedContext,
    businessName: typeof businessName === "string" ? businessName : undefined,
    businessNeighborhood: typeof businessNeighborhood === "string" ? businessNeighborhood : undefined,
    businessSector: typeof businessSector === "string" ? businessSector : undefined,
    nearbyBusinesses: normalizedNearbyBusinesses,
    history: normalizedHistory,
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
          nearbyBusinesses: normalizedNearbyBusinesses,
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
