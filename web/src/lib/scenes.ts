import fs from "node:fs";
import path from "node:path";
import { ASSETS_DIR, DATA_DIR, assetUrl, nfc } from "./paths";
import type { StoreScene, VmdProduct } from "./scene-types";

export type { StoreScene, VmdProduct } from "./scene-types";

/* ------------------------------------------------------------------ *
 * data/scenes/<projectId>.json  (scripts/build_store_scene.py)
 * data/vmd-products.json        (VMD product palette)
 * Paths in the JSON are repo-root relative ("assets/..."); they are turned
 * into /api/assets URLs here so the client never sees a disk path.
 * ------------------------------------------------------------------ */

function toUrl(rel: string | null | undefined): string | null {
  if (!rel) return null;
  const normalized = nfc(rel).replace(/\\/g, "/").replace(/^\.?\/*/, "");
  return assetUrl(normalized.startsWith("assets/") ? normalized.slice("assets/".length) : normalized);
}

export function hasScene(projectId: string): boolean {
  return fs.existsSync(path.join(DATA_DIR, "scenes", `${projectId}.json`));
}

export function getScene(projectId: string): StoreScene | null {
  if (!/^[A-Za-z0-9_-]+$/.test(projectId)) return null;
  const file = path.join(DATA_DIR, "scenes", `${projectId}.json`);
  if (!fs.existsSync(file)) return null;
  return resolveScene(JSON.parse(fs.readFileSync(file, "utf8")) as StoreScene);
}

/** data/vignettes/<projectId>.json (scripts/build_vignettes.py): 매장연출 scenes, one shot each */
export function getVignettes(projectId: string): StoreScene[] {
  if (!/^[A-Za-z0-9_-]+$/.test(projectId)) return [];
  const file = path.join(DATA_DIR, "vignettes", `${projectId}.json`);
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { vignettes: StoreScene[] };
  return raw.vignettes.map(resolveScene);
}

function resolveScene(raw: StoreScene): StoreScene {
  return {
    ...raw,
    floors: raw.floors.map((floor) => ({
      ...floor,
      items: floor.items.map((item) => ({ ...item, url: toUrl(item.url) ?? "" })),
      drawing: floor.drawing ? { ...floor.drawing, url: toUrl(floor.drawing.url) ?? "" } : null,
    })),
    shots: raw.shots.map((shot) => ({ ...shot, thumb: toUrl(shot.thumb) })),
    ...(raw.hanger ? { hanger: toUrl(raw.hanger) ?? undefined } : {}),
    ...(raw.pantsHanger ? { pantsHanger: toUrl(raw.pantsHanger) ?? undefined } : {}),
    drawings: (raw.drawings ?? []).map((d) => ({ ...d, url: toUrl(d.url) ?? "" })),
  };
}

type VmdConfig = { root: string; mount?: Record<string, "hang" | "place"> };

/**
 * VMD palette = the glb files under data/vmd-products.json `root`
 * (<카테고리>/<스타일>/<스타일코드_컬러>.glb, thumbnail = same stem .png).
 * Adding a product is dropping files into that tree - the folders become the 상품 tab's tree.
 */
export function getVmdProducts(): VmdProduct[] {
  const file = path.join(DATA_DIR, "vmd-products.json");
  if (!fs.existsSync(file)) return [];
  const conf = JSON.parse(fs.readFileSync(file, "utf8")) as VmdConfig;
  const rootRel = nfc(conf.root).replace(/^assets\//, "");
  const rootAbs = path.join(ASSETS_DIR, ...rootRel.split("/"));
  const out: VmdProduct[] = [];

  const walk = (abs: string, segs: string[]) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const name = nfc(entry.name);
      if (entry.isDirectory()) {
        walk(path.join(abs, entry.name), [...segs, name]);
        continue;
      }
      if (!name.toLowerCase().endsWith(".glb")) continue;
      const stem = name.slice(0, -4);
      const rel = [rootRel, ...segs].join("/");
      // web copy (scripts/build_product_lite.py: ~60k triangles, 1K texture) when it is up to date
      const liteRel = [rootRel.replace(/상품$/, "상품_웹"), ...segs].join("/");
      const liteAbs = path.join(ASSETS_DIR, ...liteRel.split("/"), name);
      const srcAbs = path.join(abs, entry.name);
      const lite = fs.existsSync(liteAbs) && fs.statSync(liteAbs).mtimeMs >= fs.statSync(srcAbs).mtimeMs;
      const color = stem.includes("_") ? stem.slice(stem.lastIndexOf("_") + 1) : undefined;
      const style = segs[segs.length - 1]?.replace(/^\S+\s+/, "") ?? stem;
      out.push({
        id: stem,
        name: color ? `${style} · ${color}` : stem,
        path: segs,
        color,
        url: assetUrl(lite ? `${liteRel}/${name}` : `${rel}/${name}`),
        thumb: fs.existsSync(path.join(abs, `${stem}.png`)) ? assetUrl(`${rel}/${stem}.png`) : null,
        mount: conf.mount?.[segs[0] ?? ""] ?? conf.mount?.default ?? "place",
      });
    }
  };
  walk(rootAbs, []);
  // the same style/colour can sit in two categories (패딩 hanging, 착장 on the torso): ids must stay unique
  const seen = new Map<string, number>();
  for (const p of out) seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
  for (const p of out) if ((seen.get(p.id) ?? 0) > 1) p.id = `${p.path[0]}/${p.id}`;
  return out;
}
