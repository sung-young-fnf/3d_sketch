import { NextResponse } from "next/server";
import { getIndex } from "@/lib/catalog";
import { categoryBrief } from "@/lib/serialize";
import { getFinishData } from "@/lib/finishes";
import type { CategoryNode } from "@/lib/types";

export const dynamic = "force-dynamic";

type TreeNode = ReturnType<typeof categoryBrief> & { children: TreeNode[] };

function buildTree(lookup: Map<string, CategoryNode>, id: string, guard = 0): TreeNode | null {
  const node = lookup.get(id);
  if (!node || guard > 32) return null;
  const children = node.childIds
    .map((childId) => buildTree(lookup, childId, guard + 1))
    .filter((child): child is TreeNode => Boolean(child));
  return { ...categoryBrief(node), children };
}

/**
 * Mirrors GET /v2/categories/root/{eid}/{FURNITURE|FINISH|TEXTURE}
 * but returns the whole tree in one shot (300 nodes - no need to recurse
 * through childDirectoryIds the way the original client does).
 */
export function GET(request: Request) {
  const type = (new URL(request.url).searchParams.get("type") ?? "FURNITURE").toUpperCase();

  if (type === "FURNITURE") {
    const index = getIndex();
    return NextResponse.json({
      result: {
        type,
        enterpriseId: index.enterpriseId,
        rootId: index.rootId,
        count: index.categories.size,
        root: buildTree(index.categories, index.rootId),
      },
    });
  }

  if (type === "FINISH" || type === "TEXTURE") {
    const data = getFinishData();
    const source = type === "FINISH" ? data.finishCategories : data.textureCategories;
    const lookup = new Map<string, CategoryNode>(source);
    const rootId = type === "FINISH" ? data.finishRootId : data.textureRootId;
    return NextResponse.json({
      result: {
        type,
        enterpriseId: getIndex().enterpriseId,
        rootId,
        count: lookup.size,
        root: buildTree(lookup, rootId),
      },
    });
  }

  return NextResponse.json({ error: `unknown category type: ${type}` }, { status: 400 });
}
