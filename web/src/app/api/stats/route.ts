import { NextResponse } from "next/server";
import { formatBytes, getAssetScan } from "@/lib/assets";
import { getIndex } from "@/lib/catalog";
import { getFinishData } from "@/lib/finishes";

export const dynamic = "force-dynamic";

/** Counts for the home page stat cards. Not an endpoint the original has. */
export function GET() {
  const index = getIndex();
  const scan = getAssetScan();
  const finishData = getFinishData();

  return NextResponse.json({
    enterpriseId: index.enterpriseId,
    productCount: index.products.length,
    componentCount: index.componentCount,
    componentsWithModel: index.componentsWithModel,
    categoryCount: index.categories.size,
    finishCount: finishData.finishes.length,
    materialCount: finishData.materials.length,
    assets: {
      fileCount: scan.files.size,
      glbCount: scan.glbCount,
      gltfCount: scan.gltfCount,
      pngCount: scan.pngCount,
      totalBytes: scan.totalBytes,
      totalSizeLabel: formatBytes(scan.totalBytes),
      scannedAt: new Date(scan.scannedAt).toISOString(),
    },
  });
}
