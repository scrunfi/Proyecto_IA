import type { Business } from "@/lib/mock-data";

export type BusinessesResponse = {
  businesses: Business[];
  neighborhoods: string[];
  generatedAt: string;
};

export type ViewportBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type BusinessDetailResponse = {
  business: Business;
  benchmark: {
    percentile: number;
    neighborhoodAvg: number;
    topQuartile: number;
  };
  recommendations: string[];
};

export async function getBusinesses(bounds?: ViewportBounds): Promise<BusinessesResponse> {
  const params = new URLSearchParams();
  if (bounds) {
    params.set("south", String(bounds.south));
    params.set("west", String(bounds.west));
    params.set("north", String(bounds.north));
    params.set("east", String(bounds.east));
  }

  const query = params.toString();
  const response = await fetch(query ? `/api/businesses?${query}` : "/api/businesses", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error("No se pudieron cargar los negocios");
  }

  return (await response.json()) as BusinessesResponse;
}

export async function getBusinessById(id: string): Promise<BusinessDetailResponse> {
  const response = await fetch(`/api/businesses/${id}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error("No se pudo cargar el detalle del negocio");
  }

  return (await response.json()) as BusinessDetailResponse;
}
