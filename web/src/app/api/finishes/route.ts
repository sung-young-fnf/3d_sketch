import { NextResponse } from "next/server";
import { listFinishes } from "@/lib/finishes";

export const dynamic = "force-dynamic";

function parseInt10(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Mirrors GET /finishes/v1 - note the flat envelope, which deliberately
 * differs from /api/search/sale/v2 (spec section 6).
 * `page` is 0-based, like the real endpoint.
 */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const page = parseInt10(params.get("page"), 0);
  const size = parseInt10(params.get("size") ?? params.get("limit"), 30);

  const result = listFinishes({
    page,
    size,
    categoryId: params.get("categoryId"),
    keyword: params.get("keyword") ?? params.get("name") ?? undefined,
    includeDescendants: params.get("includeDescendants") !== "0",
  });

  return NextResponse.json(result);
}
