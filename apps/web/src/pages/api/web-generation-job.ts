import type { NextApiRequest, NextApiResponse } from "next";

import { backendFetch } from "@/lib/backend-client";

type Body = {
  action?: "start" | "status" | "cancel";
  job_id?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = (req.body ?? {}) as Body;
  const action = body.action ?? "status";

  try {
    if (action === "start") {
      const payload = await backendFetch<unknown>(
        "/shops/web-generation-job/start?batch_size=25&only_missing_website=true",
        { method: "POST" },
      );
      res.status(200).json(payload);
      return;
    }

    if (action === "cancel") {
      if (!body.job_id) {
        res.status(400).json({ error: "job_id requerido" });
        return;
      }

      const payload = await backendFetch<unknown>(
        `/shops/web-generation-job/cancel?job_id=${encodeURIComponent(body.job_id)}`,
        { method: "POST" },
      );
      res.status(200).json(payload);
      return;
    }

    const statusPath = body.job_id
      ? `/shops/web-generation-job/status?job_id=${encodeURIComponent(body.job_id)}`
      : "/shops/web-generation-job/status";
    const payload = await backendFetch<unknown>(statusPath);
    res.status(200).json(payload);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    res.status(502).json({ error: "No se pudo gestionar el job de generacion web", detail });
  }
}
