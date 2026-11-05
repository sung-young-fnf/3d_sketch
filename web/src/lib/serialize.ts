import { localAsset, type LocalAsset } from "./assets";
import { getCategory, getCategoryPath, type IndexedProduct } from "./catalog";
import type { CategoryNode } from "./types";

export type ComponentAssets = {
  glb: LocalAsset;
  gltf: LocalAsset;
  png: LocalAsset;
};

export function componentAssets(product: IndexedProduct, stem: string): ComponentAssets {
  return {
    glb: localAsset(product.localDir, stem, "glb"),
    gltf: localAsset(product.localDir, stem, "gltf"),
    png: localAsset(product.localDir, stem, "png"),
  };
}

/** Thumbnail: prefer the downloaded PNG, fall back to the remote CDN preview. */
export function thumbnailFor(product: IndexedProduct): { src: string | null; fallback: string | null; local: boolean } {
  const first = product.components[0];
  if (first) {
    const png = localAsset(product.localDir, first.stem, "png");
    if (png.exists) return { src: png.url, fallback: first.previewUrl ?? product.previewUrl, local: true };
    return { src: first.previewUrl ?? product.previewUrl, fallback: null, local: false };
  }
  return { src: product.previewUrl, fallback: null, local: false };
}

export function categoryBrief(node: CategoryNode) {
  return {
    id: node.id,
    name: node.name,
    parentId: node.parentId,
    depth: node.depth,
    pathLabel: node.pathLabel,
    childDirectoryIds: node.childIds,
    productCount: node.productCount,
    descendantProductCount: node.descendantProductCount,
  };
}

/** Mirrors an item of `/search/sale/v2` -> result.data[]. */
export function toListItem(product: IndexedProduct) {
  const thumb = thumbnailFor(product);
  return {
    id: product.id,
    name: product.name,
    tags: product.tags,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    categoryIds: product.categoryIds,
    primaryCategoryId: product.primaryCategoryId,
    localDir: product.localDir,
    previewImage: product.previewUrl,
    thumbnail: thumb.src,
    thumbnailFallback: thumb.fallback,
    thumbnailIsLocal: thumb.local,
    optionCount: product.optionCount,
    itemCount: product.itemCount,
    components: {
      count: product.components.length,
      records: product.components.map((component) => {
        const assets = componentAssets(product, component.stem);
        return {
          id: component.id,
          order: component.order,
          modelingId: component.modelingId,
          status: component.status,
          options: component.options,
          price: component.price,
          previewImage: component.previewUrl,
          dimensionMm: component.dimensionMm,
          local: {
            glb: assets.glb.exists ? assets.glb.url : null,
            gltf: assets.gltf.exists ? assets.gltf.url : null,
            png: assets.png.exists ? assets.png.url : null,
          },
        };
      }),
    },
  };
}

/** Mirrors `/product/v1/sales/{id}/detail` (spec sections 8 and 9). */
export function toProductDetail(product: IndexedProduct) {
  const categories = product.categoryIds
    .map((id) => getCategory(id))
    .filter((node): node is CategoryNode => Boolean(node))
    .map((node) => ({
      ...categoryBrief(node),
      path: getCategoryPath(node.id).map((p) => ({ id: p.id, name: p.name })),
    }));

  return {
    product: {
      id: product.id,
      name: product.name,
      tags: product.tags,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      localDir: product.localDir,
      previewImage: product.previewUrl,
      categoryIds: product.categoryIds,
      primaryCategoryId: product.primaryCategoryId,
      componentCount: product.components.length,
      optionCount: product.optionCount,
    },
    categories,
    componentDetails: product.components.map((component) => {
      const assets = componentAssets(product, component.stem);
      return {
        component: {
          id: component.id,
          order: component.order,
          options: component.options,
          price: component.price,
          status: component.status,
          stem: component.stem,
          dimensionMm: component.dimensionMm,
          arAsset: component.glbUrl ? { android: { url: component.glbUrl }, ios: null } : null,
          dxfAsset: null,
        },
        modeling: {
          id: component.modelingId,
          urlKind: component.urlKind,
          renderAsset: component.glbUrl ? { url: component.glbUrl } : null,
          gltfAsset: component.gltfUrl ? { url: component.gltfUrl } : null,
          images: component.previewUrl ? [component.previewUrl] : [],
        },
        local: {
          glb: assets.glb.exists ? { url: assets.glb.url, size: assets.glb.size } : null,
          gltf: assets.gltf.exists ? { url: assets.gltf.url, size: assets.gltf.size } : null,
          png: assets.png.exists ? { url: assets.png.url, size: assets.png.size } : null,
        },
      };
    }),
  };
}
