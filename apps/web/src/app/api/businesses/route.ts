import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";
import { toBusiness } from "@/lib/business-adapter";

type ShopsResponse = {
  total: number;
  shops: Array<{
    _id: string;
    name?: string;
    category?: string;
    score?: number;
    gap?: number;
    reviews?: number;
    location?: { coordinates?: [number, number] };
    barrio?: { name?: string };
  }>;
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const south = searchParams.get("south");
  const west = searchParams.get("west");
  const north = searchParams.get("north");
  const east = searchParams.get("east");

  const pageSize = 5000;
  const params = new URLSearchParams({
    limit: String(pageSize),
    skip: "0",
    active_only: "false",
  });
  if (south && west && north && east) {
    params.set("south", south);
    params.set("west", west);
    params.set("north", north);
    params.set("east", east);
  }

  const allShops: ShopsResponse["shops"] = [];
  let total = Number.POSITIVE_INFINITY;

  while (allShops.length < total) {
    params.set("skip", String(allShops.length));
    const payload = await backendFetch<ShopsResponse>(`/shops?${params.toString()}`);
    total = payload.total;

    if (payload.shops.length === 0) {
      break;
    }

    allShops.push(...payload.shops);
  }

  const businesses = allShops.map(toBusiness);
  const neighborhoods = Array.from(new Set(businesses.map((item) => item.neighborhood))).sort();

  return NextResponse.json({
    businesses,
    neighborhoods,
    generatedAt: new Date().toISOString(),
  });
}
