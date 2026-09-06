export const UNIT_DEFINITIONS = Object.freeze({
  g: { baseUnit: "g", factor: 1, decimals: 0 },
  kg: { baseUnit: "g", factor: 1000, decimals: 3 },
  ml: { baseUnit: "ml", factor: 1, decimals: 0 },
  l: { baseUnit: "ml", factor: 1000, decimals: 3 },
  db: { baseUnit: "db", factor: 1, decimals: 2 },
  csomag: { baseUnit: "csomag", factor: 1, decimals: 2 },
  doboz: { baseUnit: "doboz", factor: 1, decimals: 2 },
  üveg: { baseUnit: "üveg", factor: 1, decimals: 2 }
});

export const SUPPORTED_UNITS = Object.freeze(Object.keys(UNIT_DEFINITIONS));

export function createId(prefix = "id") {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function todayIso(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysIso(offset, from = new Date()) {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  date.setDate(date.getDate() + Number(offset));
  return todayIso(date);
}

export function normalizeText(value = "") {
  return value.trim().toLocaleLowerCase("hu-HU").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function unitDefinition(unit) {
  const definition = UNIT_DEFINITIONS[unit];
  if (!definition) throw new Error(`Nem támogatott mértékegység: ${unit}`);
  return definition;
}

export function compatibleUnits(unitOrBase) {
  const baseUnit = UNIT_DEFINITIONS[unitOrBase]?.baseUnit || unitOrBase;
  return SUPPORTED_UNITS.filter((unit) => UNIT_DEFINITIONS[unit].baseUnit === baseUnit);
}

export function quantityStep(unit) {
  return ["g", "ml"].includes(unit) ? 1 : 0.1;
}

export function parseDecimal(value) {
  if (typeof value === "number") return value;
  const normalized = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  return Number(normalized);
}

export function toBaseQuantity(value, unit) {
  const numericValue = parseDecimal(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) throw new Error("A mennyiség nem lehet negatív.");
  return Math.round(numericValue * unitDefinition(unit).factor * 1e6) / 1e6;
}

export function fromBaseQuantity(baseValue, unit) {
  return Number(baseValue) / unitDefinition(unit).factor;
}

export function formatNumber(value, maximumFractionDigits = 3) {
  return new Intl.NumberFormat("hu-HU", { maximumFractionDigits }).format(Number(value) || 0);
}

export function formatQuantity(baseValue, displayUnit) {
  const value = fromBaseQuantity(baseValue, displayUnit);
  return `${formatNumber(value, unitDefinition(displayUnit).decimals)} ${displayUnit}`;
}

export function formatMoney(value, currency = "HUF") {
  if (currency === "HUF") return `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0))} Ft`;
  return new Intl.NumberFormat("hu-HU", { style: "currency", currency }).format(Number(value) || 0);
}

export function parseLocalDate(isoDate) {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function formatDate(isoDate) {
  const date = parseLocalDate(isoDate);
  if (!date) return "Nincs megadva";
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

export function daysUntil(isoDate, from = new Date()) {
  const target = parseLocalDate(isoDate);
  if (!target) return Number.POSITIVE_INFINITY;
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((target - start) / 86400000);
}

export function expiryState(isoDate, from = new Date()) {
  const days = daysUntil(isoDate, from);
  if (!Number.isFinite(days)) return { days, status: "unknown", label: "Nincs dátum" };
  if (days < 0) return { days, status: "expired", label: `${Math.abs(days)} napja lejárt` };
  if (days === 0) return { days, status: "today", label: "Ma lejár" };
  if (days === 1) return { days, status: "soon", label: "Holnap lejár" };
  if (days <= 3) return { days, status: "soon", label: `${days} nap múlva` };
  return { days, status: "ok", label: `${days} nap múlva` };
}

export function valueForQuantity(batch, quantityBase) {
  const initialQuantity = Number(batch.initialQuantityBase) || Number(batch.quantityBase) || 0;
  const totalPrice = Number(batch.totalPriceAtPurchase) || 0;
  if (initialQuantity <= 0) return 0;
  return Math.round((totalPrice / initialQuantity) * Number(quantityBase || 0));
}

export function validateAllocation(totalBase, allocation) {
  const normalized = Object.fromEntries(Object.entries(allocation).map(([key, value]) => [key, Math.max(0, Number(value) || 0)]));
  const allocated = Object.values(normalized).reduce((sum, value) => sum + value, 0);
  const epsilon = 0.0001;
  if (allocated > Number(totalBase) + epsilon) throw new Error("A felosztott mennyiség nem lehet több a készletnél.");
  return { ...normalized, allocated, remaining: Math.max(0, Number(totalBase) - allocated) };
}

function startOfWeek(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - day);
  return result;
}

function isSameMonth(date, reference) {
  return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth();
}

export function calculateStatistics(events, reference = new Date()) {
  const weekStart = startOfWeek(reference);
  const elapsedWeekDays = (reference.getDay() + 6) % 7;
  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);
  const previousWeekEnd = new Date(previousWeekStart);
  previousWeekEnd.setDate(previousWeekEnd.getDate() + elapsedWeekDays + 1);
  const previousMonthStart = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
  const previousMonthDays = new Date(reference.getFullYear(), reference.getMonth(), 0).getDate();
  const previousMonthEnd = new Date(previousMonthStart.getFullYear(), previousMonthStart.getMonth(), Math.min(reference.getDate(), previousMonthDays) + 1);
  const usableEvents = events.filter((event) => !event.deletedAt && event.occurredAt);
  const discarded = usableEvents.filter((event) => event.type === "discarded");
  const consumed = usableEvents.filter((event) => event.type === "consumed");
  const thisWeek = discarded.filter((event) => new Date(event.occurredAt) >= weekStart);
  const thisMonth = discarded.filter((event) => isSameMonth(new Date(event.occurredAt), reference));
  const sumValue = (items) => items.reduce((sum, event) => sum + (Number(event.financialValue) || 0), 0);
  const previousWeekComparable = discarded.filter((event) => {
    const occurredAt = new Date(event.occurredAt);
    return occurredAt >= previousWeekStart && occurredAt < previousWeekEnd;
  });
  const previousMonthComparable = discarded.filter((event) => {
    const occurredAt = new Date(event.occurredAt);
    return occurredAt >= previousMonthStart && occurredAt < previousMonthEnd;
  });
  const dayLabels = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];
  const weeklyDiscardedByDay = dayLabels.map((label, index) => {
    const dayStart = new Date(weekStart);
    dayStart.setDate(weekStart.getDate() + index);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);
    const value = sumValue(discarded.filter((event) => {
      const occurredAt = new Date(event.occurredAt);
      return occurredAt >= dayStart && occurredAt < dayEnd;
    }));
    return {
      label,
      value,
      isToday: dayStart.getFullYear() === reference.getFullYear() && dayStart.getMonth() === reference.getMonth() && dayStart.getDate() === reference.getDate()
    };
  });
  const groupedDiscarded = thisMonth.reduce((groups, event) => {
    const key = `${event.productName || "Ismeretlen"}|${event.displayUnit || event.baseUnit || "db"}`;
    const group = groups.get(key) || { name: event.productName || "Ismeretlen", quantityBase: 0, unit: event.displayUnit || event.baseUnit || "db", value: 0 };
    group.quantityBase += Number(event.quantityBase) || 0;
    group.value += Number(event.financialValue) || 0;
    groups.set(key, group);
    return groups;
  }, new Map());

  const weeklyDiscardedValue = sumValue(thisWeek);
  const monthlyDiscardedValue = sumValue(thisMonth);
  const previousWeekValue = sumValue(previousWeekComparable);
  const previousMonthValue = sumValue(previousMonthComparable);

  return {
    weeklyDiscardedValue,
    weeklyDiscardedByDay,
    monthlyDiscardedValue,
    weeklyComparison: { current: weeklyDiscardedValue, previous: previousWeekValue, difference: weeklyDiscardedValue - previousWeekValue },
    monthlyComparison: { current: monthlyDiscardedValue, previous: previousMonthValue, difference: monthlyDiscardedValue - previousMonthValue },
    monthlyDiscarded: [...groupedDiscarded.values()].sort((a, b) => b.value - a.value),
    consumedThisMonth: consumed.filter((event) => isSameMonth(new Date(event.occurredAt), reference)).length,
    discardedEventCount: thisMonth.length
  };
}
