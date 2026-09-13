const OPEN_FOOD_FACTS_BASE = "https://world.openfoodfacts.org";
const APP_IDENTIFICATION = "MiMeddig/0.2 (https://github.com/Erika400/MiMeddig-V2-teszt)";

function firstText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value) && value.length) {
      const text = value.map((item) => typeof item === "string" ? item : item?.name || item?.id || "").filter(Boolean).join(", ");
      if (text) return text;
    }
  }
  return "";
}

function inferCategory(product) {
  if (product.product_type === "beauty") return "Kozmetikum";
  if (product.product_type === "product") return "Háztartás";
  const tags = (product.categories_tags || []).join(" ").toLowerCase();
  if (/dair|milk|cheese|yog|cream|vaj|tej|sajt|joghurt/.test(tags)) return "Tejtermék";
  if (/meat|poultry|beef|pork|fish|hús|baromfi|hal/.test(tags)) return "Húsáru";
  if (/fruit|gyümölcs/.test(tags)) return "Gyümölcs";
  if (/vegetable|zöldség/.test(tags)) return "Zöldség";
  if (/bread|bakery|pék|kenyér/.test(tags)) return "Pékáru";
  if (/beverage|drink|water|juice|ital/.test(tags)) return "Ital";
  if (/sweet|chocolate|candy|dessert|édess/.test(tags)) return "Édesség";
  return "Alapélelmiszer";
}

export function parsePackage(product = {}) {
  const numeric = Number(String(product.product_quantity ?? "").replace(",", "."));
  const normalizedUnit = String(product.product_quantity_unit || "").trim().toLowerCase().replace(/^floz$/, "fl oz");
  const supportedUnit = ["g", "kg", "oz", "lb", "ml", "cl", "l", "fl oz", "db"].includes(normalizedUnit) ? normalizedUnit : "";
  if (Number.isFinite(numeric) && numeric > 0 && supportedUnit) {
    return { packageQuantity: numeric, packageUnit: supportedUnit, packageText: firstText(product.quantity, `${numeric} ${supportedUnit}`) };
  }
  const quantityText = firstText(product.quantity);
  const match = quantityText.match(/([\d.,]+)\s*(fl\s*oz|kg|lb|oz|g|ml|cl|l|db)\b/i);
  if (!match) return { packageQuantity: null, packageUnit: "g", packageText: quantityText };
  let quantity = Number(match[1].replace(",", "."));
  let unit = match[2].toLowerCase().replace(/\s+/g, " ");
  return { packageQuantity: quantity, packageUnit: unit, packageText: quantityText };
}

export function normalizeOpenFoodFactsProduct(payload, requestedBarcode) {
  const product = payload?.product;
  if (!product) return null;
  const name = firstText(product.product_name_hu, product.product_name, product.generic_name_hu, product.generic_name);
  if (!name) return null;
  const packageData = parsePackage(product);
  return {
    barcode: String(product.code || requestedBarcode),
    brand: firstText(product.brands),
    name,
    category: inferCategory(product),
    subcategory: "Egyéb",
    ...packageData,
    imageUrl: firstText(product.image_front_small_url, product.image_url),
    source: "open-food-facts",
    sourceLabel: "Open Food Facts",
    sourceUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(product.code || requestedBarcode)}`,
    confirmedCount: 0,
    lastConfirmedAt: null,
    lastCheckedAt: new Date().toISOString()
  };
}

export async function lookupOpenFoodFacts(barcode, { fetchImpl = globalThis.fetch, signal } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A külső termékadatbázis nem érhető el.");
  const fields = [
    "code", "product_name", "product_name_hu", "generic_name", "generic_name_hu", "brands",
    "quantity", "product_quantity", "product_quantity_unit", "categories_tags", "product_type",
    "image_front_small_url", "image_url"
  ].join(",");
  const query = new URLSearchParams({
    lc: "hu",
    cc: "hu",
    product_type: "all",
    fields,
    "User-Agent": APP_IDENTIFICATION,
    app_name: "MiMeddig",
    app_version: "0.2"
  });
  const response = await fetchImpl(`${OPEN_FOOD_FACTS_BASE}/api/v3.6/product/${encodeURIComponent(barcode)}.json?${query}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`A külső termékadatbázis átmenetileg nem válaszol (${response.status}).`);
  return normalizeOpenFoodFactsProduct(await response.json(), barcode);
}

export { OPEN_FOOD_FACTS_BASE };
