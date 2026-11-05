import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/catalog";
import { toListItem } from "@/lib/serialize";
import { SORT_KEYS, type SortKey } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseInt10(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Mirrors GET /search/sale/v2 - including its envelope, which differs from the
 * finishes/materials endpoints on purpose (spec section 6):
 *   { result: { data: [...], meta: { page, count, totalPage, totalCount } } }
 *
 * `page` is **0-based**, like the real API: page=0 is the first page and the
 * last page is totalPage-1. The site's own URL is 1-based, so the page
 * components convert (apiPage = uiPage - 1) rather than passing it through.
 */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const sortParam = (params.get("sort") ?? "UPDATED_DESC").toUpperCase() as SortKey;
  const sort = SORT_KEYS.includes(sortParam) ? sortParam : "UPDATED_DESC";

  const categoryIds = (params.get("categoryIds") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const result = searchProducts({
    page: parseInt10(params.get("page"), 0),
    limit: parseInt10(params.get("limit"), 30),
    sort,
    categoryIds,
    keyword: params.get("keyword") ?? undefined,
    // extension over the real API: used by the clone's "카테고리 내 검색" box
    includeDescendants: params.get("includeDescendants") === "1" || params.get("includeDescendants") === "true",
  });

  return NextResponse.json({
    result: { data: result.data.map(toListItem), meta: result.meta },
  });
}
