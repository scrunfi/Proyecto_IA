import { NextResponse } from "next/server";

import { businesses, neighborhoods } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json({
    businesses,
    neighborhoods,
    generatedAt: new Date().toISOString(),
  });
}
