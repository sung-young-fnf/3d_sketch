import Link from "next/link";
import { notFound } from "next/navigation";
import ProjectDetail, { type ProjectView } from "@/components/ProjectDetail";
import { getIndex } from "@/lib/catalog";
import { getProject, renderThumb } from "@/lib/projects";
import { getScene, getVignettes, getVmdProducts } from "@/lib/scenes";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  return { title: project ? `${project.name || "Untitled"} | 프로젝트` : "프로젝트" };
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();

  // which placed items we can open in the local 3D viewer
  const catalog = getIndex();
  const localProductIds = new Set<string>();
  for (const floor of project.floors) {
    for (const item of floor.items) {
      if (catalog.productById.has(item.productId)) localProductIds.add(item.productId);
    }
  }

  // resolve render thumbnails server-side into a plain view model
  const view: ProjectView = {
    id: project.id,
    name: project.name,
    coverUrl: project.coverUrl,
    owner: project.owner,
    sharedWith: project.sharedWith,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    floorCount: project.floorCount,
    areaM2: project.areaM2,
    counts: project.counts,
    floors: project.floors,
    store: (() => {
      const scene = getScene(project.id);
      return scene ? { scene, products: getVmdProducts(), vignettes: getVignettes(project.id) } : null;
    })(),
    renders: project.renders.map((render) => {
      const thumb = renderThumb(render);
      return {
        id: render.id,
        title: render.title,
        resolution: render.resolution,
        createdAt: render.createdAt,
        thumb: thumb.src,
        thumbFallback: thumb.fallback,
        full: render.full,
        panel: render.panel,
        tags: render.tags,
      };
    }),
  };

  return (
    <>
      <nav className="breadcrumb" style={{ marginBottom: 10 }}>
        <Link className="muted" href="/ko/projects/team">
          전체 프로젝트
        </Link>
        <span className="breadcrumb__sep">/</span>
        <span>{project.name || "Untitled"}</span>
      </nav>
      <ProjectDetail project={view} localProductIds={[...localProductIds]} />
    </>
  );
}
