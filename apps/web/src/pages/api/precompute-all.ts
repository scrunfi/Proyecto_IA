import type { NextApiRequest, NextApiResponse } from "next";

import { backendFetch } from "@/lib/backend-client";

type PrecomputeResponse = {
  status: string;
  total_candidates: number;
  processed: number;
  source_breakdown: { n8n: number; fallback: number };
  errors: number;
};

type PrecomputeRequestBody = {
  limit?: number;
  skip?: number;
  only_missing?: boolean;
  force_refresh?: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = (req.body ?? {}) as PrecomputeRequestBody;
    const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(500, Number(body.limit))) : 50;
    const skip = Number.isFinite(body.skip) ? Math.max(0, Number(body.skip)) : 0;
    const onlyMissing = body.only_missing ?? true;
    const forceRefresh = body.force_refresh ?? false;

    const payload = await backendFetch<PrecomputeResponse>(
      `/shops/ai-analysis/precompute-all?limit=${limit}&skip=${skip}&only_missing=${onlyMissing}&force_refresh=${forceRefresh}`,
      { method: "POST" },
    );
    res.status(200).json(payload);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    res.status(502).json({ error: "No se pudo lanzar el precompute masivo", detail });
  }
}
