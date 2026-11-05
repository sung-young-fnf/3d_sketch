import Link from "next/link";
import { notFound } from "next/navigation";
import StoreViewer from "@/components/StoreViewer";
import { getScene, getVmdProducts } from "@/lib/scenes";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scene = getScene(id);
  return { title: scene ? `${scene.name} | 3D 매장` : "3D 매장" };
}

export default async function StorePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scene = getScene(id);
  if (!scene) notFound();

  return (
    <>
      <nav className="breadcrumb" style={{ marginBottom: 10 }}>
        <Link className="muted" href="/ko/projects/team">
          전체 프로젝트
        </Link>
        <span className="breadcrumb__sep">/</span>
        <Link className="muted" href={`/ko/projects/${id}`}>
          {scene.name}
        </Link>
        <span className="breadcrumb__sep">/</span>
        <span>3D 매장</span>
      </nav>
      <div className="page-title">{scene.name} · 3D 매장</div>
      <StoreViewer scene={scene} products={getVmdProducts()} />
    </>
  );
}
