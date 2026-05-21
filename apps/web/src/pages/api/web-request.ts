import type { NextApiRequest, NextApiResponse } from "next";

import { backendFetch } from "@/lib/backend-client";

type Body = {
  action?: "create" | "latest";
  shop_id?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = (req.body ?? {}) as Body;
  const action = body.action ?? "latest";
  const shopId = body.shop_id;
  if (!shopId) {
    res.status(400).json({ error: "shop_id requerido" });
    return;
  }

  try {
    if (action === "create") {
      const payload = await backendFetch<unknown>(`/shops/id/${encodeURIComponent(shopId)}/web-request`, {
        method: "POST",
      });
      res.status(200).json(payload);
      return;
    }

    const payload = await backendFetch<unknown>(`/shops/id/${encodeURIComponent(shopId)}/web-request/latest`);
    res.status(200).json(payload);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    res.status(502).json({ error: "No se pudo gestionar solicitud de web", detail });
  }
}
