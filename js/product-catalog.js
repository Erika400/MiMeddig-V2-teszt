import { lookupOpenFoodFacts } from "./external-product-lookup.js?v=1";
import { cacheProduct, confirmCachedProduct, getCachedProduct, getLocalCatalogProduct, saveLocalCatalogProduct } from "./local-product-cache.js?v=1";

export function normalizeBarcode(value) {
  const barcode = String(value ?? "").replace(/[\s-]/g, "");
  if (!/^\d{7,14}$/.test(barcode)) throw new Error("A vonalkód 7–14 számjegyből álljon.");
  return barcode;
}

export function inventoryDefaultsFromCatalog(product) {
  const quantity = Number(product?.packageQuantity);
  const unit = product?.packageUnit;
  const supportedUnits = new Set(["g", "kg", "ml", "l", "db", "csomag", "doboz", "üveg"]);
  if (Number.isFinite(quantity) && quantity > 0 && supportedUnits.has(unit)) return { quantity, unit };
  return { quantity: 1, unit: "db" };
}

export async function lookupProductByBarcode(value, adapters = {}) {
  const barcode = normalizeBarcode(value);
  const readCache = adapters.getCachedProduct || getCachedProduct;
  const readCommunity = adapters.getCommunityProduct || getLocalCatalogProduct;
  const readExternal = adapters.getExternalProduct || lookupOpenFoodFacts;
  const writeCache = adapters.cacheProduct || cacheProduct;

  const cached = await readCache(barcode);
  if (cached) return { status: "found", stage: "cache", product: cached };
  const community = await readCommunity(barcode);
  if (community) {
    await writeCache(community);
    return { status: "found", stage: "community", product: community };
  }
  try {
    const external = await readExternal(barcode);
    if (!external) return { status: "not-found", stage: "external", barcode };
    await writeCache(external);
    return { status: "found", stage: "external", product: external };
  } catch (error) {
    return { status: "unavailable", stage: "external", barcode, error };
  }
}

export async function rememberManualProduct(product) {
  return saveLocalCatalogProduct({ ...product, barcode: normalizeBarcode(product.barcode) });
}

export async function confirmProduct(product) {
  return confirmCachedProduct(product);
}
