import { NextResponse } from "next/server";
import { getIndex } from "@/lib/catalog";
import { floorGeometry, getProject, renderThumb } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "project not found", id }, { status: 404 });

  const catalog = getIndex();

  return NextResponse.json({
    result: "SUCCESS",
    data: {
      id: project.id,
      name: project.name,
      coverImage: project.coverUrl,
      owner: project.owner,
      sharedWith: project.sharedWith,
      bookmarked: project.bookmarked,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      floorCount: project.floorCount,
      areaM2: project.areaM2,
      counts: project.counts,
      floors: project.floors.map((floor) => {
        const geometry = floorGeometry(floor);
        return {
          id: floor.id,
          title: floor.title,
          areaM2: floor.areaM2,
          cornerCount: floor.corners.length,
          wallCount: floor.walls.length,
          itemCount: floor.items.length,
          dimensions: floor.dimensions,
          geometry: geometry
            ? {
                viewBox: geometry.viewBox,
                widthMm: geometry.widthMm,
                heightMm: geometry.heightMm,
                degenerate: geometry.degenerate,
              }
            : null,
          // which placed items map to a product we have locally (clickable -> 3D)
          items: floor.items.map((item) => ({
            productId: item.productId,
            x: item.x,
            z: item.z,
            ry: item.ry,
            code: item.code,
            hasLocalProduct: catalog.productById.has(item.productId),
          })),
        };
      }),
      renders: project.renders.map((render) => {
        const thumb = renderThumb(render);
        return {
          id: render.id,
          title: render.title,
          resolution: render.resolution,
          createdAt: render.createdAt,
          floorplanId: render.floorplanId,
          thumb: thumb.src,
          thumbFallback: thumb.fallback,
          full: render.full,
          panel: render.panel,
          tags: render.tags,
        };
      }),
    },
    error: null,
  });
}
