import { NextResponse } from "next/server";
import { getScene, getVmdProducts } from "@/lib/scenes";

export const dynamic = "force-dynamic";

/** Store scene for the three.js viewer + the VMD product palette. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scene = getScene(id);
  if (!scene) {
    return NextResponse.json({ result: "FAIL", data: null, error: { message: "scene not built" } }, { status: 404 });
  }
  return NextResponse.json({ result: "SUCCESS", data: { scene, products: getVmdProducts() }, error: null });
}
