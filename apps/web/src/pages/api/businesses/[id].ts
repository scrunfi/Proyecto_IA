import type { NextApiRequest, NextApiResponse } from "next";

import { backendFetch } from "@/lib/backend-client";
import { toBusiness } from "@/lib/business-adapter";

type BackendShop = {
  _id: string;
  name?: string;
  category?: string;
  score?: number;
  gap?: number;
  reviews?: number;
  has_website?: boolean;
  location?: { coordinates?: [number, number] };
  barrio?: { name?: string };
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const id = req.query.id;
  if (typeof id !== "string" || id.length === 0) {
    res.status(400).json({ error: "ID invalido" });
    return;
  }

  let normalizedId = id;
  try {
    normalizedId = decodeURIComponent(id);
  } catch {
    normalizedId = id;
  }

  let shop: BackendShop;
  try {
    shop = await backendFetch<BackendShop>(`/shops/id/${encodeURIComponent(normalizedId)}`);
  } catch {
    res.status(404).json({ message: "Negocio no encontrado" });
    return;
  }

  const business = toBusiness(shop);
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

  res.status(200).json({ business, benchmark, recommendations });
}
