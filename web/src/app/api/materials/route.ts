import { NextResponse } from "next/server";
import { listMaterials } from "@/lib/finishes";

export const dynamic = "force-dynamic";

function parseInt10(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Mirrors GET /v1/materials/{eid}/byCategories (flat envelope).
 * `page` is 0-based, like the real endpoint.
 */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const result = listMaterials({
    page: parseInt10(params.get("page"), 0),
    size: parseInt10(params.get("size") ?? params.get("limit"), 30),
    categoryId: params.get("categoryId") ?? params.get("categories"),
    keyword: params.get("keyword") ?? undefined,
    includeDescendants: params.get("includeDescendants") !== "0",
  });

  return NextResponse.json(result);
}
