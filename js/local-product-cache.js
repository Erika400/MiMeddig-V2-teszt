import { STORES, getOne, putOne } from "./db.js?v=11";

export async function getCachedProduct(barcode) {
  const value = await getOne(STORES.productCache, barcode);
  return value?.product || null;
}

export async function cacheProduct(product) {
  if (!product?.barcode) return product;
  await putOne(STORES.productCache, {
    barcode: product.barcode,
    source: product.source || "unknown",
    cachedAt: new Date().toISOString(),
    product
  });
  return product;
}

export async function getLocalCatalogProduct(barcode) {
  const value = await getOne(STORES.catalogDrafts, barcode);
  return value?.product || null;
}

export async function saveLocalCatalogProduct(product) {
  const previous = await getOne(STORES.catalogDrafts, product.barcode);
  const now = new Date().toISOString();
  const saved = {
    ...product,
    source: "mimeddig-local",
    sourceLabel: "Saját, helyi termékadat",
    sourceUrl: "",
    confirmedCount: Math.max(1, Number(previous?.product?.confirmedCount) || 0),
    lastConfirmedAt: now,
    createdAt: previous?.product?.createdAt || now,
    updatedAt: now
  };
  await putOne(STORES.catalogDrafts, {
    barcode: saved.barcode,
    syncStatus: "local-only",
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    product: saved
  });
  await cacheProduct(saved);
  return saved;
}

export async function confirmCachedProduct(product) {
  const now = new Date().toISOString();
  const confirmed = {
    ...product,
    confirmedCount: (Number(product.confirmedCount) || 0) + 1,
    lastConfirmedAt: now
  };
  await cacheProduct(confirmed);
  return confirmed;
}
