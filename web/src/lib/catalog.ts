import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, foldKey, nfc } from "./paths";
import type {
  CatalogFile,
  CatalogProduct,
  CategoriesFile,
  CategoryNode,
  SortKey,
} from "./types";

export type IndexedProduct = CatalogProduct & {
  /** lowercased NFC haystack: name + tags + id */
  searchKey: string;
  updatedAtMs: number;
  createdAtMs: number;
  nameKey: string;
  optionCount: number;
  itemCount: number;
};

export type CatalogIndex = {
  enterpriseId: string;
  rootId: string;
  categories: Map<string, CategoryNode>;
  categoryList: CategoryNode[];
  products: IndexedProduct[];
  productById: Map<string, IndexedProduct>;
  productsByCategory: Map<string, IndexedProduct[]>;
  componentCount: number;
  componentsWithModel: number;
  builtAt: number;
};

const GLOBAL_KEY = "__archisketch_catalog_index__";

/**
 * 126 products carry an empty `categoryIds`. The real sidebar shows them under
 * a node called "미분류 제품들" that does not exist in categories.json, so the
 * clone synthesizes it as a first child of the root.
 */
export const UNCATEGORIZED_ID = "__UNCATEGORIZED__";
export const UNCATEGORIZED_NAME = "미분류 제품들";

type GlobalWithIndex = typeof globalThis & { [GLOBAL_KEY]?: CatalogIndex & { localMtime?: number } };

/** our own VMD products (scripts/build_library_local.py), layered over the downloaded catalog */
const LOCAL_FILE = "library-local.json";

function localMtime(): number {
  try {
    return fs.statSync(path.join(DATA_DIR, LOCAL_FILE)).mtimeMs;
  } catch {
    return 0;
  }
}

function readJson<T>(file: string): T {
  const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
  return JSON.parse(raw) as T;
}

function toMs(value: string | null): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

function build(): CatalogIndex {
  const categoriesFile = readJson<CategoriesFile>("categories.json");
  const catalogFile = readJson<CatalogFile>("catalog.json");
  const localProducts = localMtime() ? readJson<CatalogFile>(LOCAL_FILE).products : [];

  const categories = new Map<string, CategoryNode>();
  for (const [id, node] of Object.entries(categoriesFile.categories)) {
    categories.set(id, {
      ...node,
      name: nfc(node.name),
      path: node.path.map(nfc),
      pathLabel: nfc(node.pathLabel),
      dir: nfc(node.dir),
    });
  }

  const products: IndexedProduct[] = [];
  const productById = new Map<string, IndexedProduct>();
  const productsByCategory = new Map<string, IndexedProduct[]>();
  let componentCount = 0;
  let componentsWithModel = 0;

  for (const raw of [...catalogFile.products, ...localProducts]) {
    const name = nfc(raw.name);
    const tags = (raw.tags ?? []).map(nfc);
    const components = raw.components ?? [];
    componentCount += components.length;
    for (const component of components) if (component.glbUrl) componentsWithModel += 1;

    const indexed: IndexedProduct = {
      ...raw,
      name,
      tags,
      localDir: nfc(raw.localDir ?? ""),
      components: components.map((component) => ({ ...component, stem: nfc(component.stem) })),
      searchKey: foldKey([name, raw.id, ...tags].join(" \u0001 ")),
      nameKey: foldKey(name),
      updatedAtMs: toMs(raw.updatedAt),
      createdAtMs: toMs(raw.createdAt),
      optionCount: components.reduce((sum, c) => sum + (c.options?.length ?? 0), 0),
      itemCount: components.length,
    };

    products.push(indexed);
    productById.set(indexed.id, indexed);
    const buckets = indexed.categoryIds.length > 0 ? indexed.categoryIds : [UNCATEGORIZED_ID];
    for (const categoryId of buckets) {
      const bucket = productsByCategory.get(categoryId);
      if (bucket) bucket.push(indexed);
      else productsByCategory.set(categoryId, [indexed]);
    }
  }

  // categories.json counts only the downloaded products
  for (const product of localProducts) {
    for (const categoryId of product.categoryIds) {
      let node = categories.get(categoryId);
      if (node) node.productCount += 1;
      while (node) {
        node.descendantProductCount += 1;
        node = node.parentId ? categories.get(node.parentId) : undefined;
      }
    }
  }

  // virtual "미분류 제품들" node, first child of the root
  const root = categories.get(categoriesFile.rootId);
  const orphanCount = productsByCategory.get(UNCATEGORIZED_ID)?.length ?? 0;
  if (root && orphanCount > 0) {
    categories.set(UNCATEGORIZED_ID, {
      id: UNCATEGORIZED_ID,
      name: UNCATEGORIZED_NAME,
      parentId: root.id,
      childIds: [],
      path: [...root.path, UNCATEGORIZED_NAME],
      pathLabel: `${root.pathLabel} / ${UNCATEGORIZED_NAME}`,
      dir: "_미분류",
      depth: root.depth + 1,
      productCount: orphanCount,
      descendantProductCount: orphanCount,
    });
    root.childIds = [UNCATEGORIZED_ID, ...root.childIds];
  }

  return {
    enterpriseId: catalogFile.enterpriseId,
    rootId: categoriesFile.rootId,
    categories,
    categoryList: [...categories.values()],
    products,
    productById,
    productsByCategory,
    componentCount,
    componentsWithModel,
    builtAt: Date.now(),
  };
}

/** Lazily built, cached on globalThis so dev HMR does not rebuild it per request. */
export function getIndex(): CatalogIndex {
  const g = globalThis as GlobalWithIndex;
  // rebuilt when scripts/build_library_local.py rewrites the local list
  const mtime = localMtime();
  if (!g[GLOBAL_KEY] || g[GLOBAL_KEY].localMtime !== mtime) g[GLOBAL_KEY] = { ...build(), localMtime: mtime };
  return g[GLOBAL_KEY];
}

export function getCategory(id: string): CategoryNode | undefined {
  return getIndex().categories.get(id);
}

export function getChildren(id: string): CategoryNode[] {
  const index = getIndex();
  const node = index.categories.get(id);
  if (!node) return [];
  // childIds order is the order the original sidebar renders in - do not sort.
  return node.childIds
    .map((childId) => index.categories.get(childId))
    .filter((child): child is CategoryNode => Boolean(child));
}

/** Breadcrumb from the root down to (and including) `id`. */
export function getCategoryPath(id: string): CategoryNode[] {
  const index = getIndex();
  const out: CategoryNode[] = [];
  let cursor = index.categories.get(id);
  let guard = 0;
  while (cursor && guard < 64) {
    out.unshift(cursor);
    cursor = cursor.parentId ? index.categories.get(cursor.parentId) : undefined;
    guard += 1;
  }
  return out;
}

export function collectDescendantIds(id: string): string[] {
  const index = getIndex();
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    out.push(current);
    const node = index.categories.get(current);
    if (node) stack.push(...node.childIds);
  }
  return out;
}

const comparators: Record<SortKey, (a: IndexedProduct, b: IndexedProduct) => number> = {
  UPDATED_DESC: (a, b) => b.updatedAtMs - a.updatedAtMs || a.nameKey.localeCompare(b.nameKey, "ko"),
  UPDATED_ASC: (a, b) => a.updatedAtMs - b.updatedAtMs || a.nameKey.localeCompare(b.nameKey, "ko"),
  NAME_ASC: (a, b) => a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id),
  NAME_DESC: (a, b) => b.name.localeCompare(a.name, "ko") || a.id.localeCompare(b.id),
  CREATED_DESC: (a, b) => b.createdAtMs - a.createdAtMs || a.nameKey.localeCompare(b.nameKey, "ko"),
  CREATED_ASC: (a, b) => a.createdAtMs - b.createdAtMs || a.nameKey.localeCompare(b.nameKey, "ko"),
};

export type SearchQuery = {
  /** 0-based, like the real /search/sale/v2 (the page URL is 1-based - callers convert) */
  page?: number;
  limit?: number;
  sort?: SortKey;
  categoryIds?: string[];
  keyword?: string;
  /** opt-in: also match products in descendant categories (used by the UI search box) */
  includeDescendants?: boolean;
};

export type SearchResult = {
  data: IndexedProduct[];
  meta: { page: number; count: number; totalPage: number; totalCount: number };
};

export function searchProducts(query: SearchQuery): SearchResult {
  const index = getIndex();
  const limit = Math.min(Math.max(query.limit ?? 30, 1), 500);
  const page = Math.max(query.page ?? 0, 0);
  const sort = query.sort ?? "UPDATED_DESC";

  let rows: IndexedProduct[];
  const requested = query.categoryIds?.filter(Boolean) ?? [];
  if (requested.length === 0) {
    rows = index.products;
  } else {
    const wanted = new Set<string>();
    for (const categoryId of requested) {
      if (query.includeDescendants) for (const id of collectDescendantIds(categoryId)) wanted.add(id);
      else wanted.add(categoryId);
    }
    const seen = new Set<string>();
    rows = [];
    for (const categoryId of wanted) {
      for (const product of index.productsByCategory.get(categoryId) ?? []) {
        if (seen.has(product.id)) continue;
        seen.add(product.id);
        rows.push(product);
      }
    }
  }

  const keyword = query.keyword ? foldKey(query.keyword).trim() : "";
  if (keyword) {
    const terms = keyword.split(/\s+/).filter(Boolean);
    rows = rows.filter((product) => terms.every((term) => product.searchKey.includes(term)));
  }

  const sorted = [...rows].sort(comparators[sort] ?? comparators.UPDATED_DESC);
  const totalCount = sorted.length;
  const totalPage = Math.max(Math.ceil(totalCount / limit), 1);
  const start = page * limit;
  const data = sorted.slice(start, start + limit);

  // meta.page echoes the 0-based page the caller asked for, even past the end.
  return { data, meta: { page, count: data.length, totalPage, totalCount } };
}
