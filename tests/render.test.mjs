import assert from "node:assert/strict";
import { productSymbol, sortShoppingItems } from "../js/render.js";

const batch = (name, category = "Egyéb") => ({ nameSnapshot: name, template: { name, category } });

assert.equal(productSymbol(batch("Csokoládé", "Édesség")), "🍬");
assert.equal(productSymbol(batch("Tojás")), "🥚");
assert.equal(productSymbol(batch("Kenyér", "Pékáru")), "🥖");

const shopping = [
  { name: "Alma tej", category: "Tejtermék" },
  { name: "Alma", category: "Gyümölcs" },
  { name: "Joghurt", category: "Tejtermék" },
  { name: "Banán", category: "Gyümölcs" }
];

assert.deepEqual(
  sortShoppingItems(shopping, "category").map((item) => item.name),
  ["Alma", "Banán", "Alma tej", "Joghurt"]
);
assert.deepEqual(
  sortShoppingItems(shopping, "name").map((item) => item.name),
  ["Alma", "Alma tej", "Banán", "Joghurt"]
);

console.log("A megjelenítési és rendezési tesztek sikeresen lefutottak.");
