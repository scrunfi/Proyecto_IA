import type { NextApiRequest, NextApiResponse } from "next";

import { backendFetch } from "@/lib/backend-client";

type Body = {
  shop_id?: string;
  force_refresh?: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = (req.body ?? {}) as Body;
  const shopId = body.shop_id;
  if (!shopId) {
    res.status(400).json({ error: "shop_id requerido" });
    return;
  }

  try {
    const forceRefresh = body.force_refresh ?? false;
    const payload = await backendFetch<unknown>(
      `/shops/id/${encodeURIComponent(shopId)}/ai-analysis?force_refresh=${forceRefresh}`,
      { method: "POST" },
    );
    res.status(200).json(payload);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    res.status(502).json({ error: "No se pudo generar el analisis IA", detail });
  }
}
