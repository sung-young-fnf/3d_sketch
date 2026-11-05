import { NextResponse } from "next/server";
import { getIndex } from "@/lib/catalog";
import { toProductDetail } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** Mirrors GET /product/v1/sales/{productId}/detail?includeStat=true */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const product = getIndex().productById.get(id);
  if (!product) return NextResponse.json({ error: "product not found", id }, { status: 404 });
  return NextResponse.json({ result: toProductDetail(product) });
}
