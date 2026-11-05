import { NextResponse } from "next/server";
import { floorplanGeometry, getTemplate } from "@/lib/templates";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const template = getTemplate(id);
  if (!template) return NextResponse.json({ error: "template not found", id }, { status: 404 });

  return NextResponse.json({
    data: {
      id: template.id,
      projectId: template.projectId,
      name: template.name,
      description: template.description,
      status: template.status,
      statusLabel: template.statusLabel,
      displaying: template.displaying,
      scope: template.scope,
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
      coverImage: template.cover.src,
      additionalImages: template.additionalImages.map((image) => ({
        id: image.id,
        url: image.src,
        fallback: image.fallback,
        isLocal: image.isLocal,
        bytes: image.bytes,
        resolution: image.resolution,
        badge: image.badge,
      })),
      productCount: template.productCount,
      products: template.products.map((product) => ({
        id: product.id,
        name: product.name,
        brandName: product.brandName,
        count: product.count,
        price: product.price,
        editorTypeCode: product.editorTypeCode,
        typeLabel: product.typeLabel,
        image: product.src,
        imageFallback: product.fallback,
        imageIsLocal: product.isLocal,
      })),
      history: template.history,
      comments: template.comments,
      floorplan: {
        ...template.floorplan,
        geometry: floorplanGeometry(template.floorplan),
      },
    },
  });
}
