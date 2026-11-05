import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, assetUrl, foldKey, nfc } from "./paths";
import type { Floor } from "./floorplan";

export { floorGeometry } from "./floorplan";
export type { Floor, FloorCorner, FloorWall, FloorItem, FloorGeometry } from "./floorplan";

/* ------------------------------------------------------------------ *
 * data/projects.json  (built by scripts/build_projects.py)
 *   Enterprise scope (원본 /ko/projects/team "전체 프로젝트"): folder tree
 *   F&F / 국내·중국·대만·홍콩 + only the projects whose detail was collected.
 * `coverLocal` / `thumbLocal` are repo-root relative ("assets/__프로젝트/...")
 * and served by /api/assets. `cover` / `thumb` / `full` are remote CDN URLs.
 * ------------------------------------------------------------------ */

export type ProjectUser = {
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
  accessType?: string;
};

export type RenderPanel = {
  resolution: string;
  cameraHeightMm: number;
  cameraClip: number;
  fov: number;
  aspect: string;
  sun: { year: number; month: number; time: string; intensity: number; orientation: number };
  indirectIntensity: number;
  world: { temperature: number; intensity: number; rotation: number };
  interiorTemperature: number;
};

export type RenderTag = { productId: string; productType: string };

export type RenderShot = {
  id: string;
  resolution: { x: number; y: number };
  title: string;
  createdAt: string;
  floorplanId: string;
  thumb: string | null;
  thumbLocal: string | null;
  full: string | null;
  panel: RenderPanel | null;
  tags: RenderTag[];
};

export type Counts = {
  render: number;
  aiSnap: number;
  tour: number;
  styler: number;
  bundle: number;
  portfolio: number;
  estimate: number;
};

export type RawProject = {
  id: string;
  name: string;
  folderId: string | null;
  cover: string | null;
  coverLocal: string | null;
  owner: ProjectUser;
  sharedWith: ProjectUser[];
  bookmarked: boolean;
  createdAt: string;
  updatedAt: string;
  floorCount: number;
  areaM2: number;
  floors: Floor[];
  renders: RenderShot[];
  renderCount: number;
  counts: Counts;
  localDir: string;
};

type RawFile = {
  enterpriseId: string;
  folders: unknown;
  trashCount: number;
  totalCount?: number;
  projects: RawProject[];
};

export type Project = Omit<RawProject, "cover" | "coverLocal"> & {
  nameKey: string;
  updatedAtMs: number;
  coverUrl: string | null;
  coverFallback: string | null;
};

/** `name` is the original label incl. its count ("국내(10)"); `collected` = local projects. */
export type ProjectFolder = { id: string; name: string; collected: number };

export type ProjectData = {
  enterpriseId: string;
  trashCount: number;
  /** total on the original site; `projects.length` is what we have locally */
  totalCount: number;
  rootName: string;
  folders: ProjectFolder[];
  projects: Project[];
  projectById: Map<string, Project>;
};

const GLOBAL_KEY = "__archisketch_project_data__";
type GlobalWithData = typeof globalThis & { [GLOBAL_KEY]?: ProjectData | null };

/** "assets/foo/bar.png" (repo-root relative) -> "/api/assets/foo/bar.png" */
function toAssetUrl(localPath: string | null | undefined): string | null {
  if (!localPath) return null;
  const normalized = nfc(localPath).replace(/\\/g, "/").replace(/^\.?\/*/, "");
  const rel = normalized.startsWith("assets/") ? normalized.slice("assets/".length) : normalized;
  return assetUrl(rel);
}

type FolderTree = {
  rootDirectories?: Array<{
    currentDirectory?: { name: string };
    childDirectories?: Array<{ id: string; name: string }>;
  }>;
};

function extractFolders(folders: unknown, projects: Array<{ folderId: string | null }>): { rootName: string; folders: ProjectFolder[] } {
  const tree = folders as FolderTree | undefined;
  const out: ProjectFolder[] = [];
  for (const root of tree?.rootDirectories ?? []) {
    for (const child of root.childDirectories ?? []) {
      const collected = projects.filter((p) => p.folderId === child.id).length;
      out.push({ id: child.id, name: nfc(child.name), collected });
    }
  }
  return { rootName: nfc(tree?.rootDirectories?.[0]?.currentDirectory?.name ?? ""), folders: out };
}

function build(): ProjectData | null {
  const file = path.join(DATA_DIR, "projects.json");
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as RawFile;

  const projects: Project[] = (raw.projects ?? []).map((item) => {
    const name = nfc(item.name ?? "").trim();
    return {
      ...item,
      name,
      folderId: item.folderId ?? null,
      nameKey: foldKey(name),
      owner: { ...item.owner, name: nfc(item.owner?.name ?? "") },
      sharedWith: (item.sharedWith ?? []).map((user) => ({ ...user, name: nfc(user.name ?? "") })),
      floors: (item.floors ?? []).map((floor) => ({ ...floor, title: nfc(floor.title ?? "") })),
      renders: item.renders ?? [],
      coverUrl: toAssetUrl(item.coverLocal) ?? item.cover,
      coverFallback: toAssetUrl(item.coverLocal) ? item.cover : null,
      updatedAtMs: Date.parse(item.updatedAt ?? "") || 0,
    };
  });

  const { rootName, folders } = extractFolders(raw.folders, projects);
  return {
    enterpriseId: raw.enterpriseId,
    trashCount: raw.trashCount ?? 0,
    totalCount: raw.totalCount ?? projects.length,
    rootName,
    folders,
    projects,
    projectById: new Map(projects.map((project) => [project.id, project])),
  };
}

const EMPTY: ProjectData = {
  enterpriseId: "",
  trashCount: 0,
  totalCount: 0,
  rootName: "",
  folders: [],
  projects: [],
  projectById: new Map(),
};

export function getProjectData(): ProjectData {
  const g = globalThis as GlobalWithData;
  if (g[GLOBAL_KEY] === undefined) g[GLOBAL_KEY] = build();
  return g[GLOBAL_KEY] ?? EMPTY;
}

export function getProject(id: string): Project | undefined {
  return getProjectData().projectById.get(id);
}

export type ProjectQuery = {
  /** folder id; omitted = 전체 프로젝트 */
  folder?: string;
  /** 유저명 검색 */
  owner?: string;
  page?: number;
  size?: number;
  keyword?: string;
  sortBy?: string;
  bookmarked?: boolean;
};

export type ProjectPage = {
  data: Project[];
  page: number;
  size: number;
  count: number;
  totalCount: number;
  totalPages: number;
};

export function listProjects(query: ProjectQuery): ProjectPage {
  const data = getProjectData();
  let rows = data.projects;

  if (query.folder) rows = rows.filter((p) => p.folderId === query.folder);
  if (query.owner) {
    const owner = foldKey(query.owner).trim();
    rows = rows.filter((p) => foldKey(p.owner.name).includes(owner));
  }
  if (query.bookmarked) rows = rows.filter((p) => p.bookmarked);

  const keyword = query.keyword ? foldKey(query.keyword).trim() : "";
  if (keyword) {
    const terms = keyword.split(/\s+/).filter(Boolean);
    rows = rows.filter((p) => terms.every((term) => p.nameKey.includes(term)));
  }

  const sorted = [...rows];
  switch ((query.sortBy ?? "updatedDesc").toLowerCase()) {
    case "updatedasc":
      sorted.sort((a, b) => a.updatedAtMs - b.updatedAtMs);
      break;
    case "nameasc":
      sorted.sort((a, b) => a.name.localeCompare(b.name, "ko"));
      break;
    default:
      sorted.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  }

  const size = Math.min(Math.max(query.size ?? 30, 1), 500);
  const page = Math.max(query.page ?? 0, 0);
  const totalCount = sorted.length;
  const totalPages = Math.max(Math.ceil(totalCount / size), 1);
  const pageRows = sorted.slice(page * size, page * size + size);

  return { data: pageRows, page, size, count: pageRows.length, totalCount, totalPages };
}

/** Render thumbnail resolved to a local /api/assets URL + remote fallback. */
export function renderThumb(render: RenderShot): { src: string | null; fallback: string | null } {
  const local = toAssetUrl(render.thumbLocal);
  if (local) return { src: local, fallback: render.thumb };
  return { src: render.thumb, fallback: null };
}

// `floorGeometry`, `Floor`, and the floor sub-types live in ./floorplan (no node
// builtins) so client components can import them; re-exported at the top.
