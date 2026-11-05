import { NextResponse } from "next/server";
import { getCategoryPath } from "@/lib/catalog";
import { finishCategoryPath, textureCategoryPath } from "@/lib/finishes";

export const dynamic = "force-dynamic";

/** Mirrors GET /v2/categories/path/{categoryId}: breadcrumb, root first. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let chain = getCategoryPath(id);
  if (chain.length === 0) chain = finishCategoryPath(id);
  if (chain.length === 0) chain = textureCategoryPath(id);

  if (chain.length === 0) return NextResponse.json({ error: "category not found", id }, { status: 404 });

  return NextResponse.json({
    result: chain.map((node) => ({
      id: node.id,
      name: node.name,
      parentId: node.parentId,
      depth: node.depth,
    })),
  });
}
