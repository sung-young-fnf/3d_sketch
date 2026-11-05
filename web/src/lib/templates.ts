import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, assetUrl, foldKey, nfc } from "./paths";

/* ------------------------------------------------------------------ *
 * data/templates.json  (built by scripts/build_templates.py)
 *   templates: 1   roomTypes: 30   styles: 12   tagGroups: 0 (empty)
 * Every `coverImage` / `local` / `localImage` is repo-root relative
 * ("assets/__템플릿/..."), served by /api/assets.
 * ------------------------------------------------------------------ */

export type StyleRef = { code: string; label: string };

export type RoomTypeRef = {
  symbol: string;
  code: number;
  label: string;
  isTemplateSupported: boolean;
};

export type TemplateImage = {
  id: string;
  remote: string | null;
  local: string | null;
  bytes: number;
  resolution: string;
  badge: string;
};

export type TemplateProduct = {
  id: string;
  name: string;
  brandName: string | null;
  count: number;
  price: { value: number; unit: string } | null;
  editorTypeCode: number;
  typeLabel: string;
  remoteImage: string | null;
  localImage: string | null;
};

export type TemplateHistoryEntry = {
  modifiedBy: { _id: string; name: string };
  modifiedFields: string[];
  modifiedAt: string;
};

export type FloorplanCorner = { id: string; x: number; z: number };

export type Floorplan = {
  archiId: string;
  version: string;
  areaMm2: number;
  dimensions: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
  corners: FloorplanCorner[];
};

export type RawTemplate = {
  id: string;
  projectId: string;
  name: string;
  description: string;
  status: string;
  statusLabel: string;
  displaying: boolean;
  scope?: string;
  styles: StyleRef[];
  roomType: string;
  roomTypeLabel: string;
  areaM2: number;
  areaPyeong: number;
  totalPrice: { value: number; unit: string };
  useCount: number;
  likeCount: number;
  owner: { name: string; email: string };
  createdAt: string;
  updatedAt: string;
  coverImage: string | null;
  additionalImages: TemplateImage[];
  products: TemplateProduct[];
  productCount: number;
  history: TemplateHistoryEntry[];
  comments: unknown[];
  floorplan: Floorplan;
  localDir: string;
};

type RawFile = {
  enterpriseId: string;
  templates: RawTemplate[];
  roomTypes: RoomTypeRef[];
  styles: StyleRef[];
  tagGroups: unknown[];
};

/** An image resolved to a local /api/assets URL plus its remote fallback. */
export type ResolvedImage = {
  src: string | null;
  fallback: string | null;
  isLocal: boolean;
};

export type Template = Omit<RawTemplate, "coverImage" | "additionalImages" | "products"> & {
  searchKey: string;
  cover: ResolvedImage;
  additionalImages: Array<TemplateImage & ResolvedImage>;
  products: Array<TemplateProduct & ResolvedImage>;
  updatedAtMs: number;
};

export type TemplateData = {
  enterpriseId: string;
  templates: Template[];
  templateById: Map<string, Template>;
  roomTypes: RoomTypeRef[];
  styles: StyleRef[];
  tagGroups: unknown[];
};

const GLOBAL_KEY = "__archisketch_template_data__";
type GlobalWithData = typeof globalThis & { [GLOBAL_KEY]?: TemplateData | null };

/** "assets/foo/bar.png" (repo-root relative) -> "/api/assets/foo/bar.png" */
function toAssetUrl(localPath: string | null | undefined): string | null {
  if (!localPath) return null;
  const normalized = nfc(localPath).replace(/\\/g, "/").replace(/^\.?\/*/, "");
  const rel = normalized.startsWith("assets/") ? normalized.slice("assets/".length) : normalized;
  return assetUrl(rel);
}

/**
 * Resolve to the local file when it is on disk, otherwise fall back to the CDN.
 * 2 of the 85 product images were never downloaded (the CDN 403s them), so this
 * has to degrade rather than render a broken row.
 */
function resolveImage(localPath: string | null, remote: string | null): ResolvedImage {
  const url = toAssetUrl(localPath);
  if (url) return { src: url, fallback: remote, isLocal: true };
  return { src: remote, fallback: null, isLocal: false };
}

function localExists(localPath: string | null | undefined): boolean {
  if (!localPath) return false;
  // repo root is one level above web/
  const abs = path.resolve(process.cwd(), "..", nfc(localPath));
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

function build(): TemplateData | null {
  const file = path.join(DATA_DIR, "templates.json");
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as RawFile;

  const templates: Template[] = (raw.templates ?? []).map((item) => {
    const name = nfc(item.name ?? "").trim();
    const description = nfc(item.description ?? "").trim();
    const styles = (item.styles ?? []).map((style) => ({ ...style, label: nfc(style.label) }));

    return {
      ...item,
      name,
      description,
      styles,
      roomTypeLabel: nfc(item.roomTypeLabel ?? ""),
      statusLabel: nfc(item.statusLabel ?? ""),
      searchKey: foldKey([name, description, item.id, ...styles.map((s) => s.label)].join(" ")),
      cover: resolveImage(item.coverImage, null),
      additionalImages: (item.additionalImages ?? []).map((image) => ({
        ...image,
        ...resolveImage(image.local, image.remote),
      })),
      products: (item.products ?? []).map((product) => {
        const present = localExists(product.localImage);
        return {
          ...product,
          name: nfc(product.name ?? ""),
          typeLabel: nfc(product.typeLabel ?? ""),
          ...resolveImage(present ? product.localImage : null, product.remoteImage),
        };
      }),
      updatedAtMs: Date.parse(item.updatedAt ?? "") || 0,
    };
  });

  return {
    enterpriseId: raw.enterpriseId,
    templates,
    templateById: new Map(templates.map((template) => [template.id, template])),
    roomTypes: raw.roomTypes ?? [],
    styles: (raw.styles ?? []).map((style) => ({ ...style, label: nfc(style.label) })),
    tagGroups: raw.tagGroups ?? [],
  };
}

const EMPTY: TemplateData = {
  enterpriseId: "",
  templates: [],
  templateById: new Map(),
  roomTypes: [],
  styles: [],
  tagGroups: [],
};

export function getTemplateData(): TemplateData {
  const g = globalThis as GlobalWithData;
  if (g[GLOBAL_KEY] === undefined) g[GLOBAL_KEY] = build();
  return g[GLOBAL_KEY] ?? EMPTY;
}

export function getTemplate(id: string): Template | undefined {
  return getTemplateData().templateById.get(id);
}

export type TemplateQuery = {
  /** 0-based, like the other list endpoints */
  page?: number;
  size?: number;
  roomTypes?: string[];
  styles?: string[];
  statuses?: string[];
  keyword?: string;
  sortBy?: string;
};

export type TemplatePage = {
  data: Template[];
  page: number;
  size: number;
  count: number;
  totalCount: number;
  totalPages: number;
};

export function listTemplates(query: TemplateQuery): TemplatePage {
  const data = getTemplateData();
  let rows = data.templates;

  const roomTypes = (query.roomTypes ?? []).filter(Boolean).map((v) => v.toUpperCase());
  if (roomTypes.length) rows = rows.filter((t) => roomTypes.includes(t.roomType.toUpperCase()));

  const styles = (query.styles ?? []).filter(Boolean).map((v) => v.toUpperCase());
  if (styles.length) {
    rows = rows.filter((t) => t.styles.some((s) => styles.includes(s.code.toUpperCase())));
  }

  const statuses = (query.statuses ?? []).filter(Boolean).map((v) => v.toUpperCase());
  if (statuses.length) rows = rows.filter((t) => statuses.includes(t.status.toUpperCase()));

  const keyword = query.keyword ? foldKey(query.keyword).trim() : "";
  if (keyword) {
    const terms = keyword.split(/\s+/).filter(Boolean);
    rows = rows.filter((t) => terms.every((term) => t.searchKey.includes(term)));
  }

  const sorted = [...rows];
  switch ((query.sortBy ?? "updatedDesc").toLowerCase()) {
    case "updatedasc":
      sorted.sort((a, b) => a.updatedAtMs - b.updatedAtMs);
      break;
    case "nameasc":
      sorted.sort((a, b) => a.name.localeCompare(b.name, "ko"));
      break;
    case "usecountdesc":
      sorted.sort((a, b) => b.useCount - a.useCount);
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

/**
 * Fit the corner ring to an SVG viewBox. `floorplan.dimensions` is a fixed
 * +/-100 m bounding box, so using it would shrink the plan to a dot - the
 * extents come from the corners themselves.
 */
export function floorplanGeometry(floorplan: Floorplan, padding = 400) {
  const corners = floorplan.corners ?? [];
  if (corners.length === 0) return null;

  const xs = corners.map((c) => c.x);
  const zs = corners.map((c) => c.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  const widthMm = maxX - minX;
  const heightMm = maxZ - minZ;

  // closed polygon, shifted into a padded viewBox
  const points = corners.map((c) => `${(c.x - minX + padding).toFixed(1)},${(c.z - minZ + padding).toFixed(1)}`);

  return {
    points: points.join(" "),
    viewBox: `0 0 ${(widthMm + padding * 2).toFixed(1)} ${(heightMm + padding * 2).toFixed(1)}`,
    widthMm,
    heightMm,
    cornerCount: corners.length,
    padding,
    minX,
    minZ,
  };
}
