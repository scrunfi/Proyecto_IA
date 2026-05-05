import { NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";
import { toBusiness } from "@/lib/business-adapter";

type BackendShop = {
  _id: string;
  name?: string;
  category?: string;
  score?: number;
  gap?: number;
  reviews?: number;
  location?: { coordinates?: [number, number] };
  barrio?: { name?: string };
};

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: Context) {
  const { id } = await context.params;
  let shop: BackendShop;

  try {
    shop = await backendFetch<BackendShop>(`/shops/id/${id}`);
  } catch {
    return NextResponse.json({ message: "Negocio no encontrado" }, { status: 404 });
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

  return NextResponse.json({ business, benchmark, recommendations });
}
