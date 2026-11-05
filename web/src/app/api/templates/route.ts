import { NextResponse } from "next/server";
import { getTemplateData, listTemplates } from "@/lib/templates";

export const dynamic = "force-dynamic";

function parseInt10(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function csv(params: URLSearchParams, key: string): string[] {
  return (params.get(key) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

/**
 * Template list. `page` is 0-based like the other list endpoints.
 * The list rows omit the heavy per-template arrays (85 products, floorplan
 * corners) - fetch /api/templates/{id} for those.
 */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const data = getTemplateData();

  const result = listTemplates({
    page: parseInt10(params.get("page"), 0),
    size: parseInt10(params.get("size") ?? params.get("limit"), 30),
    roomTypes: csv(params, "roomTypes"),
    styles: csv(params, "styles"),
    statuses: csv(params, "statuses"),
    keyword: params.get("keyword") ?? undefined,
    sortBy: params.get("sortBy") ?? "updatedDesc",
  });

  return NextResponse.json({
    data: result.data.map((template) => ({
      id: template.id,
      projectId: template.projectId,
      name: template.name,
      description: template.description,
      status: template.status,
      statusLabel: template.statusLabel,
      displaying: template.displaying,
      styles: template.styles,
      roomType: template.roomType,
      roomTypeLabel: template.roomTypeLabel,
      areaM2: template.areaM2,
      areaPyeong: template.areaPyeong,
      totalPrice: template.totalPrice,
      useCount: template.useCount,
      likeCount: template.likeCount,
      owner: template.owner,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
      productCount: template.productCount,
      coverImage: template.cover.src,
      coverImageFallback: template.cover.fallback,
      additionalImageCount: template.additionalImages.length,
    })),
    page: result.page,
    size: result.size,
    count: result.count,
    totalCount: result.totalCount,
    totalPages: result.totalPages,
    facets: {
      roomTypes: data.roomTypes.filter((roomType) => roomType.isTemplateSupported),
      styles: data.styles,
      tagGroups: data.tagGroups,
    },
  });
}
