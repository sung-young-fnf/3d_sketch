import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, assetUrl, foldKey, nfc } from "./paths";
import type { CategoryNode } from "./types";

/* ------------------------------------------------------------------ *
 * data/finishes-textures.json
 *   finishCategories : 4 nodes   finishes  : 51
 *   textureCategories: 8 nodes   materials : 26
 * `local` values are repo-root relative ("assets/__마감재/...") and every
 * one of them is verified present on disk; `remote` is the CDN fallback.
 * ------------------------------------------------------------------ */

export const FINISH_MAP_KEYS = ["preview", "original", "albedo", "normal", "roughness", "metalness"] as const;
export type FinishMapKey = (typeof FINISH_MAP_KEYS)[number];

export const MATERIAL_MAP_KEYS = [
  "previewImage",
  "colorImage",
  "normalImage",
  "roughnessImage",
  "metalImage",
] as const;
export type MaterialMapKey = (typeof MATERIAL_MAP_KEYS)[number];

export const FINISH_MAP_LABELS: Record<FinishMapKey, string> = {
  preview: "미리보기 (preview)",
  original: "원본 (original)",
  albedo: "알베도 (albedo)",
  normal: "노멀 (normal)",
  roughness: "러프니스 (roughness)",
  metalness: "메탈니스 (metalness)",
};

export const MATERIAL_MAP_LABELS: Record<MaterialMapKey, string> = {
  previewImage: "미리보기 (previewImage)",
  colorImage: "컬러 (colorImage)",
  normalImage: "노멀 (normalImage)",
  roughnessImage: "러프니스 (roughnessImage)",
  metalImage: "메탈 (metalImage)",
};

type RawCategory = {
  id: string;
  name: string;
  parentId: string | null;
  childIds: string[];
  path: string[];
  pathLabel: string;
};

type RawFinish = {
  id: string;
  name: string;
  categoryIds: string[];
  sku: string | null;
  code: string | null;
  showInEditor: boolean;
  mappingDimension: { width: number; height: number; unit: string } | null;
  salesInfo: Record<string, unknown> | null;
  renderSettings: { glossy: number; bumpy: number } | null;
  remote: Partial<Record<FinishMapKey, string>>;
  local: Partial<Record<FinishMapKey, string>>;
};

type RawMaterial = {
  id: string;
  name: string;
  categoryId: string;
  categories: string[];
  showInEditor: boolean;
  roughness: number | null;
  normalScale: { x: number; y: number } | null;
  remote: Partial<Record<MaterialMapKey, string>>;
  local: Partial<Record<MaterialMapKey, string>>;
};

type RawFile = {
  finishCategories: Record<string, RawCategory>;
  finishes: RawFinish[];
  textureCategories: Record<string, RawCategory>;
  materials: RawMaterial[];
};

export type MapEntry = { key: string; label: string; url: string | null; remote: string | null };

export type Finish = Omit<RawFinish, "local" | "remote"> & {
  searchKey: string;
  maps: MapEntry[];
  thumbnail: string | null;
  thumbnailFallback: string | null;
  missingMaps: string[];
};

export type Material = Omit<RawMaterial, "local" | "remote"> & {
  searchKey: string;
  maps: MapEntry[];
  thumbnail: string | null;
  thumbnailFallback: string | null;
  missingMaps: string[];
};

export type FinishData = {
  finishRootId: string;
  textureRootId: string;
  finishCategories: Map<string, CategoryNode>;
  textureCategories: Map<string, CategoryNode>;
  finishes: Finish[];
  finishById: Map<string, Finish>;
  materials: Material[];
  materialById: Map<string, Material>;
};

const GLOBAL_KEY = "__archisketch_finish_data__";
type GlobalWithData = typeof globalThis & { [GLOBAL_KEY]?: FinishData | null };

/** "assets/foo/bar.png" (repo-root relative) -> "/api/assets/foo/bar.png" */
function toAssetUrl(localPath: string | undefined): string | null {
  if (!localPath) return null;
  const normalized = nfc(localPath).replace(/\\/g, "/").replace(/^\.?\/*/, "");
  const rel = normalized.startsWith("assets/") ? normalized.slice("assets/".length) : normalized;
  return assetUrl(rel);
}

function toCategoryMap(
  raw: Record<string, RawCategory>,
  directCounts: Map<string, number>,
): { map: Map<string, CategoryNode>; rootId: string } {
  const map = new Map<string, CategoryNode>();
  let rootId = "";
  for (const node of Object.values(raw)) {
    if (!node.parentId) rootId = node.id;
    map.set(node.id, {
      id: node.id,
      name: nfc(node.name),
      parentId: node.parentId,
      childIds: node.childIds ?? [],
      path: (node.path ?? []).map(nfc),
      pathLabel: nfc(node.pathLabel ?? ""),
      dir: (node.path ?? []).map(nfc).join("/"),
      depth: Math.max((node.path ?? []).length - 1, 0),
      productCount: directCounts.get(node.id) ?? 0,
      descendantProductCount: 0,
    });
  }
  // roll direct counts up the tree
  const rollup = (id: string, guard = 0): number => {
    const node = map.get(id);
    if (!node || guard > 32) return 0;
    let total = node.productCount;
    for (const childId of node.childIds) total += rollup(childId, guard + 1);
    node.descendantProductCount = total;
    return total;
  };
  if (rootId) rollup(rootId);
  return { map, rootId };
}

function build(): FinishData | null {
  const file = path.join(DATA_DIR, "finishes-textures.json");
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as RawFile;

  const finishCounts = new Map<string, number>();
  for (const item of raw.finishes) {
    for (const categoryId of item.categoryIds ?? []) {
      finishCounts.set(categoryId, (finishCounts.get(categoryId) ?? 0) + 1);
    }
  }
  const materialCounts = new Map<string, number>();
  for (const item of raw.materials) {
    const ids = item.categories?.length ? item.categories : [item.categoryId];
    for (const categoryId of ids) {
      if (!categoryId) continue;
      materialCounts.set(categoryId, (materialCounts.get(categoryId) ?? 0) + 1);
    }
  }

  const finishCats = toCategoryMap(raw.finishCategories, finishCounts);
  const textureCats = toCategoryMap(raw.textureCategories, materialCounts);

  const finishes: Finish[] = raw.finishes.map((item) => {
    const name = nfc(item.name).trim();
    const maps: MapEntry[] = FINISH_MAP_KEYS.map((key) => ({
      key,
      label: FINISH_MAP_LABELS[key],
      url: toAssetUrl(item.local?.[key]),
      remote: item.remote?.[key] ?? null,
    }));
    const missingMaps = maps.filter((m) => !m.url).map((m) => m.key);
    const preview = toAssetUrl(item.local?.preview) ?? toAssetUrl(item.local?.original);
    return {
      id: item.id,
      name,
      categoryIds: item.categoryIds ?? [],
      sku: item.sku,
      code: item.code,
      showInEditor: item.showInEditor,
      mappingDimension: item.mappingDimension,
      salesInfo: item.salesInfo,
      renderSettings: item.renderSettings,
      searchKey: foldKey([name, item.id, item.sku ?? "", item.code ?? ""].join(" ")),
      maps,
      thumbnail: preview,
      thumbnailFallback: item.remote?.preview ?? item.remote?.original ?? null,
      missingMaps,
    };
  });

  const materials: Material[] = raw.materials.map((item) => {
    const name = nfc(item.name).trim();
    const maps: MapEntry[] = MATERIAL_MAP_KEYS.map((key) => ({
      key,
      label: MATERIAL_MAP_LABELS[key],
      url: toAssetUrl(item.local?.[key]),
      remote: item.remote?.[key] ?? null,
    }));
    return {
      id: item.id,
      name,
      categoryId: item.categoryId,
      categories: item.categories?.length ? item.categories : [item.categoryId].filter(Boolean),
      showInEditor: item.showInEditor,
      roughness: item.roughness,
      normalScale: item.normalScale,
      searchKey: foldKey([name, item.id].join(" ")),
      maps,
      thumbnail: toAssetUrl(item.local?.previewImage) ?? toAssetUrl(item.local?.colorImage),
      thumbnailFallback: item.remote?.previewImage ?? null,
      missingMaps: maps.filter((m) => !m.url).map((m) => m.key),
    };
  });

  return {
    finishRootId: finishCats.rootId,
    textureRootId: textureCats.rootId,
    finishCategories: finishCats.map,
    textureCategories: textureCats.map,
    finishes,
    finishById: new Map(finishes.map((f) => [f.id, f])),
    materials,
    materialById: new Map(materials.map((m) => [m.id, m])),
  };
}

const EMPTY: FinishData = {
  finishRootId: "",
  textureRootId: "",
  finishCategories: new Map(),
  textureCategories: new Map(),
  finishes: [],
  finishById: new Map(),
  materials: [],
  materialById: new Map(),
};

export function getFinishData(): FinishData {
  const g = globalThis as GlobalWithData;
  if (g[GLOBAL_KEY] === undefined) g[GLOBAL_KEY] = build();
  return g[GLOBAL_KEY] ?? EMPTY;
}

export function hasFinishData(): boolean {
  return getFinishData().finishes.length > 0 || getFinishData().materials.length > 0;
}

function categoryPath(map: Map<string, CategoryNode>, id: string): CategoryNode[] {
  const out: CategoryNode[] = [];
  let cursor = map.get(id);
  let guard = 0;
  while (cursor && guard < 32) {
    out.unshift(cursor);
    cursor = cursor.parentId ? map.get(cursor.parentId) : undefined;
    guard += 1;
  }
  return out;
}

export function finishCategoryPath(id: string): CategoryNode[] {
  return categoryPath(getFinishData().finishCategories, id);
}

export function textureCategoryPath(id: string): CategoryNode[] {
  return categoryPath(getFinishData().textureCategories, id);
}

export function descendantsOf(map: Map<string, CategoryNode>, id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    out.push(current);
    const node = map.get(current);
    if (node) stack.push(...node.childIds);
  }
  return out;
}

export type ListQuery = {
  /** 0-based, like the real /finishes/v1 and /v1/materials/.../byCategories */
  page?: number;
  size?: number;
  categoryId?: string | null;
  keyword?: string;
  includeDescendants?: boolean;
};

export type Paged<T> = {
  data: T[];
  page: number;
  size: number;
  count: number;
  totalCount: number;
  totalPages: number;
};

function paginate<T extends { searchKey: string; name: string }>(
  rows: T[],
  query: ListQuery,
): Paged<T> {
  const size = Math.min(Math.max(query.size ?? 30, 1), 500);
  const page = Math.max(query.page ?? 0, 0);
  const keyword = query.keyword ? foldKey(query.keyword).trim() : "";
  let filtered = rows;
  if (keyword) {
    const terms = keyword.split(/\s+/).filter(Boolean);
    filtered = filtered.filter((row) => terms.every((term) => row.searchKey.includes(term)));
  }
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const totalCount = sorted.length;
  const totalPages = Math.max(Math.ceil(totalCount / size), 1);
  const data = sorted.slice(page * size, page * size + size);
  return { data, page, size, count: data.length, totalCount, totalPages };
}

/** Mirrors GET /finishes/v1 (envelope per spec section 6: flat, not {result}). */
export function listFinishes(query: ListQuery): Paged<Finish> {
  const data = getFinishData();
  let rows = data.finishes;
  if (query.categoryId) {
    const wanted = new Set(
      query.includeDescendants
        ? descendantsOf(data.finishCategories, query.categoryId)
        : [query.categoryId],
    );
    rows = rows.filter((row) => row.categoryIds.some((id) => wanted.has(id)));
  }
  return paginate(rows, query);
}

/** Mirrors GET /v1/materials/{eid}/byCategories. */
export function listMaterials(query: ListQuery): Paged<Material> {
  const data = getFinishData();
  let rows = data.materials;
  if (query.categoryId) {
    const wanted = new Set(
      query.includeDescendants
        ? descendantsOf(data.textureCategories, query.categoryId)
        : [query.categoryId],
    );
    rows = rows.filter((row) => row.categories.some((id) => wanted.has(id)));
  }
  return paginate(rows, query);
}
