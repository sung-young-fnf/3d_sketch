import path from "node:path";

/**
 * The clone reads the reverse-engineering output that lives next to `web/`:
 *   fnf_3dsketch/data    <- catalog.json / categories.json  (read only)
 *   fnf_3dsketch/assets  <- downloaded .glb/.gltf/.png      (read only)
 * Both can be overridden with env vars.
 */
const projectRoot = path.resolve(process.cwd(), "..");

export const DATA_DIR = path.resolve(process.env.ARCHI_DATA_DIR ?? path.join(projectRoot, "data"));
export const ASSETS_DIR = path.resolve(
  process.env.ARCHI_ASSETS_DIR ?? path.join(projectRoot, "assets"),
);

/** NFC-normalize: the upstream API hands back NFD-decomposed Korean. */
export function nfc(value: string): string {
  return value.normalize("NFC");
}

/** Lowercased NFC, for keyword matching. */
export function foldKey(value: string): string {
  return nfc(value).toLowerCase();
}

/** Build the URL that serves a file out of ../assets through /api/assets. */
export function assetUrl(relPath: string): string {
  return (
    "/api/assets/" +
    nfc(relPath)
      .split("/")
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join("/")
  );
}
