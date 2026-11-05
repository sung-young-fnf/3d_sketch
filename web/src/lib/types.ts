export type CategoryNode = {
  id: string;
  name: string;
  parentId: string | null;
  childIds: string[];
  path: string[];
  pathLabel: string;
  dir: string;
  depth: number;
  productCount: number;
  descendantProductCount: number;
};

export type CategoriesFile = {
  rootId: string;
  categories: Record<string, CategoryNode>;
};

export type ComponentOption = { key: string; value: string };

export type Dimension = { w: number; d: number; h: number } | null;

export type CatalogComponent = {
  id: string;
  order: number;
  options: ComponentOption[];
  price: { value: number; unit: string } | null;
  modelingId: string | null;
  status: string;
  urlKind: "modelings" | "legacy-resolved" | "no-model" | string;
  glbUrl: string | null;
  gltfUrl: string | null;
  previewUrl: string | null;
  dimensionMm: Dimension;
  stem: string;
};

export type CatalogProduct = {
  id: string;
  name: string;
  categoryIds: string[];
  primaryCategoryId: string | null;
  localDir: string;
  previewUrl: string | null;
  tags: string[];
  createdAt: string | null;
  updatedAt: string | null;
  components: CatalogComponent[];
};

export type CatalogFile = {
  enterpriseId: string;
  products: CatalogProduct[];
};

export type SortKey =
  | "UPDATED_DESC"
  | "UPDATED_ASC"
  | "NAME_ASC"
  | "NAME_DESC"
  | "CREATED_DESC"
  | "CREATED_ASC";

export const SORT_KEYS: SortKey[] = [
  "UPDATED_DESC",
  "UPDATED_ASC",
  "NAME_ASC",
  "NAME_DESC",
  "CREATED_DESC",
  "CREATED_ASC",
];

export const SORT_LABELS: Record<SortKey, string> = {
  UPDATED_DESC: "수정 최신순",
  UPDATED_ASC: "수정 오래된순",
  NAME_ASC: "이름 오름차순",
  NAME_DESC: "이름 내림차순",
  CREATED_DESC: "생성 최신순",
  CREATED_ASC: "생성 오래된순",
};

export const PAGE_SIZES = [30, 60, 120] as const;
