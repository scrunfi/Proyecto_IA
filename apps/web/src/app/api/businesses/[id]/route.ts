import { NextResponse } from "next/server";

import { businesses } from "@/lib/mock-data";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_: Request, context: Context) {
  const { id } = await context.params;
  const business = businesses.find((item) => item.id === id);

  if (!business) {
    return NextResponse.json({ message: "Negocio no encontrado" }, { status: 404 });
  }

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
