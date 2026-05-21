import type { NextApiRequest, NextApiResponse } from "next";

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
    hasComments?: boolean;
    has_website?: boolean;
    website?: string;
    contact_website?: string;
    brand_website?: string;
    osm?: { tags?: Record<string, unknown> };
    location?: { coordinates?: [number, number] };
    barrio?: { name?: string };
  }>;
};

type ReviewsIndexResponse = {
  data: Array<{
    shop_id?: string;
    reviews?: Array<{ text?: string }>;
  }>;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const south = typeof req.query.south === "string" ? req.query.south : null;
    const west = typeof req.query.west === "string" ? req.query.west : null;
    const north = typeof req.query.north === "string" ? req.query.north : null;
    const east = typeof req.query.east === "string" ? req.query.east : null;

    const pageSize = 5000;
    const params = new URLSearchParams({
      limit: String(pageSize),
      skip: "0",
      active_only: "true",
    });

    if (south && west && north && east) {
      params.set("south", south);
      params.set("west", west);
      params.set("north", north);
      params.set("east", east);
    }

    const allShops: ShopsResponse["shops"] = [];
    let total = Number.POSITIVE_INFINITY;

    const reviewsIndex = await backendFetch<ReviewsIndexResponse>("/reviews-test");
    const shopsWithComments = new Set(
      (reviewsIndex.data ?? [])
        .filter(
          (item) =>
            item.shop_id && Array.isArray(item.reviews) && item.reviews.some((r) => r?.text?.trim()),
        )
        .map((item) => item.shop_id as string),
    );

    while (allShops.length < total) {
      params.set("skip", String(allShops.length));
      const payload = await backendFetch<ShopsResponse>(`/shops?${params.toString()}`);
      total = payload.total;

      if (payload.shops.length === 0) {
        break;
      }

      allShops.push(...payload.shops);
    }

    const businesses = allShops
      .map((shop) => ({
        ...shop,
        hasComments: shopsWithComments.has(shop._id),
        has_website:
          shop.has_website ??
          Boolean(
            shop.website ||
              shop.contact_website ||
              shop.brand_website ||
              shop.osm?.tags?.website ||
              shop.osm?.tags?.["contact:website"] ||
              shop.osm?.tags?.["brand:website"],
          ),
      }))
      .map(toBusiness);

    const neighborhoods = Array.from(new Set(businesses.map((item) => item.neighborhood))).sort();

    res.status(200).json({
      businesses,
      neighborhoods,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    res.status(502).json({ error: "No se pudieron cargar los datos de negocios", detail });
  }
}
