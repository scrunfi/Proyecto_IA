import type { Business } from "@/lib/mock-data";

type BackendShop = {
  _id: string;
  name?: string;
  category?: string;
  subcategory?: string;
  score?: number;
  gap?: number;
  reviews?: number;
  hasComments?: boolean;
  location?: {
    coordinates?: [number, number];
  };
  barrio?: {
    name?: string;
  };
};

export function toBusiness(item: BackendShop): Business {
  const coordinates = item.location?.coordinates ?? [0, 0];
  const lon = coordinates[0] ?? 0;
  const lat = coordinates[1] ?? 0;

  return {
    id: item._id,
    name: item.name ?? "Negocio sin nombre",
    neighborhood: item.barrio?.name ?? "Sin barrio",
    category: item.category ?? "Otros",
    subcategory: item.subcategory ?? item.category ?? "Otros",
    lat,
    lon,
    score: item.score ?? 0,
    gap: item.gap ?? 100,
    reviews: item.reviews ?? 0,
    hasComments: item.hasComments ?? false,
  };
}
