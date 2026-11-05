import { NextResponse } from "next/server";
import { getProjectData, listProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";

function parseInt10(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Project list. `page` is 0-based like the other list endpoints. List rows omit
 * the heavy per-project arrays (floors, renders) - fetch /api/projects/{id}.
 */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const data = getProjectData();

  const result = listProjects({
    folder: params.get("directoryId") ?? params.get("folder") ?? undefined,
    owner: params.get("owner") ?? undefined,
    page: parseInt10(params.get("page"), 0),
    size: parseInt10(params.get("size") ?? params.get("limit"), 30),
    keyword: params.get("keyword") ?? undefined,
    sortBy: params.get("sortBy") ?? "updatedDesc",
    bookmarked: params.get("bookmarked") === "1" || params.get("bookmarked") === "true",
  });

  return NextResponse.json({
    result: "SUCCESS",
    data: {
      content: result.data.map((project) => ({
        id: project.id,
        name: project.name,
        folderId: project.folderId,
        coverImage: project.coverUrl,
        coverImageFallback: project.coverFallback,
        bookmarked: project.bookmarked,
        owner: project.owner,
        sharedWith: project.sharedWith,
        floorCount: project.floorCount,
        areaM2: project.areaM2,
        renderCount: project.renderCount,
        counts: project.counts,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })),
      page: result.page,
      size: result.size,
      count: result.count,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
      hasNext: (result.page + 1) * result.size < result.totalCount,
    },
    meta: {
      folders: data.folders,
      totalCount: data.totalCount,
      trashCount: data.trashCount,
    },
    error: null,
  });
}
