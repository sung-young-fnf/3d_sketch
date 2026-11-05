import fs from "node:fs";
import path from "node:path";
import { ASSETS_DIR, assetUrl, nfc } from "./paths";

export type AssetScan = {
  /** relative POSIX paths, NFC-normalized */
  files: Map<string, number>;
  totalBytes: number;
  glbCount: number;
  gltfCount: number;
  pngCount: number;
  scannedAt: number;
};

const GLOBAL_KEY = "__archisketch_asset_scan__";
type GlobalWithScan = typeof globalThis & { [GLOBAL_KEY]?: AssetScan };

/** The downloader is still writing into ../assets, so the scan is short-lived. */
const TTL_MS = 20_000;

function scan(): AssetScan {
  const files = new Map<string, number>();
  let totalBytes = 0;
  let glbCount = 0;
  let gltfCount = 0;
  let pngCount = 0;

  const walk = (abs: string, rel: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${nfc(entry.name)}` : nfc(entry.name);
      const childAbs = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        walk(childAbs, childRel);
        continue;
      }
      if (!entry.isFile()) continue;
      let size = 0;
      try {
        size = fs.statSync(childAbs).size;
      } catch {
        continue;
      }
      files.set(childRel, size);
      totalBytes += size;
      const lower = childRel.toLowerCase();
      if (lower.endsWith(".glb")) glbCount += 1;
      else if (lower.endsWith(".gltf")) gltfCount += 1;
      else if (lower.endsWith(".png")) pngCount += 1;
    }
  };

  if (fs.existsSync(ASSETS_DIR)) walk(ASSETS_DIR, "");

  return { files, totalBytes, glbCount, gltfCount, pngCount, scannedAt: Date.now() };
}

export function getAssetScan(): AssetScan {
  const g = globalThis as GlobalWithScan;
  const cached = g[GLOBAL_KEY];
  if (cached && Date.now() - cached.scannedAt < TTL_MS) return cached;
  const fresh = scan();
  g[GLOBAL_KEY] = fresh;
  return fresh;
}

export function hasAsset(relPath: string): boolean {
  return getAssetScan().files.has(nfc(relPath));
}

export type LocalAsset = { rel: string; url: string; exists: boolean; size: number };

export function localAsset(localDir: string, stem: string, ext: string): LocalAsset {
  const rel = nfc(`${localDir}/${stem}.${ext}`);
  const size = getAssetScan().files.get(rel) ?? 0;
  return { rel, url: assetUrl(rel), exists: size > 0, size };
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value >= 100 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}
