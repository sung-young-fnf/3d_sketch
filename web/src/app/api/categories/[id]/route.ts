import { NextResponse } from "next/server";
import { getCategory, getChildren } from "@/lib/catalog";
import { getFinishData } from "@/lib/finishes";
import { categoryBrief } from "@/lib/serialize";
import type { CategoryNode } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Mirrors GET /v2/categories/{categoryId}: one node plus its children. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let node: CategoryNode | undefined = getCategory(id);
  let children: CategoryNode[] = node ? getChildren(id) : [];

  if (!node) {
    const data = getFinishData();
    node = data.finishCategories.get(id) ?? data.textureCategories.get(id);
    if (node) {
      const source = data.finishCategories.has(id) ? data.finishCategories : data.textureCategories;
      children = node.childIds
        .map((childId) => source.get(childId))
        .filter((child): child is CategoryNode => Boolean(child));
    }
  }

  if (!node) return NextResponse.json({ error: "category not found", id }, { status: 404 });

  return NextResponse.json({
    result: { ...categoryBrief(node), children: children.map(categoryBrief) },
  });
}
