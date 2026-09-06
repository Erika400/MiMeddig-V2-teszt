import assert from "node:assert/strict";
import {
  calculateStatistics,
  expiryState,
  formatQuantity,
  fromBaseQuantity,
  parseDecimal,
  quantityStep,
  toBaseQuantity,
  validateAllocation,
  valueForQuantity
} from "../js/domain.js";

assert.equal(toBaseQuantity(0.7, "kg"), 700);
assert.equal(fromBaseQuantity(700, "kg"), 0.7);
assert.equal(toBaseQuantity(250, "ml"), 250);
assert.equal(parseDecimal("0,6"), 0.6);
assert.equal(toBaseQuantity("0,6", "kg"), 600);
assert.equal(formatQuantity(700, "kg"), "0,7 kg");
assert.equal(toBaseQuantity("0,5", "db"), 0.5);
assert.equal(formatQuantity(0.5, "db"), "0,5 db");
assert.equal(quantityStep("db"), 0.1);
assert.equal(quantityStep("kg"), 0.1);
assert.equal(quantityStep("g"), 1);

const split = validateAllocation(1000, { consumed: 700, frozen: 200, discarded: 100 });
assert.equal(split.remaining, 0);
assert.throws(() => validateAllocation(1000, { consumed: 700, frozen: 200, discarded: 101 }), /nem lehet több/);
assert.equal(validateAllocation(1, { consumed: 0.5, frozen: 0, discarded: 0 }).remaining, 0.5);

const batch = { initialQuantityBase: 1000, quantityBase: 1000, totalPriceAtPurchase: 2000 };
assert.equal(valueForQuantity(batch, 100), 200);
assert.equal(expiryState("2026-08-02", new Date(2026, 7, 2)).status, "today");
assert.equal(expiryState("2026-08-05", new Date(2026, 7, 2)).status, "soon");

const events = [
  { id: "1", type: "discarded", productName: "Tej", quantityBase: 100, displayUnit: "ml", financialValue: 80, occurredAt: "2026-08-02T08:00:00.000Z", deletedAt: null },
  { id: "2", type: "consumed", productName: "Tej", quantityBase: 900, displayUnit: "ml", financialValue: 0, occurredAt: "2026-08-02T08:00:00.000Z", deletedAt: null },
  { id: "3", type: "discarded", productName: "Kenyér", quantityBase: 1, displayUnit: "db", financialValue: 100, occurredAt: "2026-07-26T08:00:00.000Z", deletedAt: null },
  { id: "4", type: "discarded", productName: "Joghurt", quantityBase: 1, displayUnit: "db", financialValue: 200, occurredAt: "2026-07-02T08:00:00.000Z", deletedAt: null }
];
const stats = calculateStatistics(events, new Date(2026, 7, 2));
assert.equal(stats.monthlyDiscardedValue, 80);
assert.equal(stats.discardedEventCount, 1);
assert.equal(stats.consumedThisMonth, 1);
assert.equal(stats.weeklyDiscardedByDay.length, 7);
assert.equal(stats.weeklyDiscardedByDay[6].value, 80);
assert.equal(stats.weeklyComparison.previous, 100);
assert.equal(stats.weeklyComparison.difference, -20);
assert.equal(stats.monthlyComparison.previous, 200);
assert.equal(stats.monthlyComparison.difference, -120);

console.log("A domain tesztek sikeresen lefutottak.");
