import { STORES, getAll, getOne, putOne, runTransaction } from "./db.js?v=10";
import { createId, normalizeText, nowIso, todayIso, toBaseQuantity, validateAllocation, valueForQuantity } from "./domain.js?v=22";

const ACTIVE_STATUS = "active";
const SETTINGS_VERSION = 3;
const DEFAULT_LOCATIONS = ["Hűtő", "Fagyasztó", "Kamra", "Fürdő", "Gyógyszerek", "Kozmetikumok", "Tisztítószerek", "Autó / garázs"];

function withSyncFields(previous = {}) {
  previous = previous || {};
  const timestamp = nowIso();
  return {
    createdAt: previous.createdAt || timestamp,
    updatedAt: timestamp,
    version: (Number(previous.version) || 0) + 1,
    deletedAt: previous.deletedAt || null
  };
}

export async function ensureDefaultSettings() {
  const current = await getOne(STORES.settings, "app");
  if (current) {
    const currentLocations = Array.isArray(current.defaultLocations) ? current.defaultLocations : [];
    const mergedLocations = [...new Set([...currentLocations, ...DEFAULT_LOCATIONS])];
    const needsUpdate = Number(current.databaseVersion) < SETTINGS_VERSION || mergedLocations.length !== currentLocations.length;
    if (!needsUpdate) return current;
    return putOne(STORES.settings, {
      ...current,
      databaseVersion: Math.max(Number(current.databaseVersion) || 0, SETTINGS_VERSION),
      defaultLocations: mergedLocations,
      ...withSyncFields(current)
    });
  }
  return putOne(STORES.settings, {
    key: "app",
    displayName: "Erika",
    language: "hu",
    currency: "HUF",
    databaseVersion: SETTINGS_VERSION,
    notifications: { enabled: false, reminderDays: [3, 1, 0], time: "09:00" },
    defaultLocations: DEFAULT_LOCATIONS,
    cloudSync: { enabled: false, provider: null },
    ...withSyncFields()
  });
}

export async function getSettings() {
  return ensureDefaultSettings();
}

export async function saveSettings(changes) {
  const current = await getSettings();
  return putOne(STORES.settings, { ...current, ...changes, ...withSyncFields(current) });
}

export async function listTemplates() {
  return (await getAll(STORES.templates)).filter((item) => !item.deletedAt);
}

export async function getTemplate(id) {
  return id ? getOne(STORES.templates, id) : null;
}

export async function listActiveBatches() {
  const [batches, templates] = await Promise.all([getAll(STORES.batches), listTemplates()]);
  const templateMap = new Map(templates.map((template) => [template.id, template]));
  return batches
    .filter((batch) => batch.status === ACTIVE_STATUS && !batch.deletedAt && Number(batch.quantityBase) > 0)
    .map((batch) => ({ ...batch, template: templateMap.get(batch.templateId) || null }));
}

export async function getBatch(id) {
  const batch = await getOne(STORES.batches, id);
  if (!batch || batch.deletedAt) return null;
  return { ...batch, template: await getTemplate(batch.templateId) };
}

export async function saveProduct(formData, existingBatchId = null) {
  const templates = await listTemplates();
  const existingBatch = existingBatchId ? await getOne(STORES.batches, existingBatchId) : null;
  const existingTemplate = formData.templateId
    ? templates.find((item) => item.id === formData.templateId)
    : templates.find((item) => item.nameKey === `${normalizeText(formData.name)}|${normalizeText(formData.brand)}`);
  const quantityBase = toBaseQuantity(formData.quantity, formData.unit);
  if (quantityBase <= 0) throw new Error("A mennyiség legyen nagyobb nullánál.");
  const timestamp = nowIso();

  const template = {
    ...(existingTemplate || {}),
    id: existingTemplate?.id || createId("template"),
    name: formData.name.trim(),
    brand: formData.brand.trim(),
    nameKey: `${normalizeText(formData.name)}|${normalizeText(formData.brand)}`,
    category: formData.category || "Egyéb",
    subcategory: formData.subcategory?.trim() || "Egyéb",
    defaultLocation: formData.location,
    defaultQuantityBase: quantityBase,
    baseUnit: formData.baseUnit,
    displayUnit: formData.unit,
    lastPrice: Math.max(0, Number(formData.totalPrice) || 0),
    barcode: formData.barcode?.trim() || null,
    ...withSyncFields(existingTemplate)
  };

  const batch = {
    ...(existingBatch || {}),
    id: existingBatch?.id || createId("batch"),
    templateId: template.id,
    nameSnapshot: template.name,
    brandSnapshot: template.brand,
    location: formData.location,
    quantityBase,
    initialQuantityBase: quantityBase,
    baseUnit: formData.baseUnit,
    displayUnit: formData.unit,
    totalPriceAtPurchase: Math.max(0, Number(formData.totalPrice) || 0),
    expiryDate: formData.expiryDate,
    purchaseDate: formData.purchaseDate || todayIso(),
    frozenAt: existingBatch?.frozenAt || null,
    status: ACTIVE_STATUS,
    note: formData.note?.trim() || "",
    ...withSyncFields(existingBatch)
  };

  return runTransaction([STORES.templates, STORES.batches, STORES.events], async (stores) => {
    stores.templates.put(template);
    stores.batches.put(batch);
    if (!existingBatch) {
      stores.events.put({
        id: createId("event"),
        type: "created",
        batchId: batch.id,
        templateId: template.id,
        productName: `${template.brand ? `${template.brand} ` : ""}${template.name}`,
        quantityBase,
        baseUnit: batch.baseUnit,
        displayUnit: batch.displayUnit,
        financialValue: 0,
        occurredAt: timestamp,
        createdAt: timestamp,
        deletedAt: null
      });
    }
    return { template, batch };
  });
}

export async function deleteBatch(batchId) {
  const batch = await getOne(STORES.batches, batchId);
  if (!batch || batch.deletedAt) return false;
  const updated = { ...batch, status: "deleted", ...withSyncFields(batch), deletedAt: nowIso() };
  const template = await getTemplate(batch.templateId);
  await runTransaction([STORES.batches, STORES.events], async (stores) => {
    stores.batches.put(updated);
    stores.events.put({
      id: createId("event"),
      type: "deleted",
      batchId,
      templateId: batch.templateId,
      productName: `${template?.brand ? `${template.brand} ` : ""}${template?.name || batch.nameSnapshot}`,
      quantityBase: batch.quantityBase,
      baseUnit: batch.baseUnit,
      displayUnit: batch.displayUnit,
      financialValue: 0,
      occurredAt: nowIso(),
      createdAt: nowIso(),
      deletedAt: null
    });
  });
  return true;
}

export async function applyQuantityAllocation(batchId, allocation) {
  const batch = await getOne(STORES.batches, batchId);
  if (!batch || batch.status !== ACTIVE_STATUS || batch.deletedAt) throw new Error("Ez a készlettétel már nem aktív.");
  const template = await getTemplate(batch.templateId);
  const values = validateAllocation(batch.quantityBase, allocation);
  if (values.allocated <= 0) throw new Error("Adj meg legalább egy mennyiséget.");

  const operationId = createId("operation");
  const occurredAt = nowIso();
  const eventIds = [];
  let frozenBatch = null;

  const updatedBatch = {
    ...batch,
    quantityBase: values.remaining,
    status: values.remaining > 0 ? ACTIVE_STATUS : "finished",
    ...withSyncFields(batch)
  };

  if (values.frozen > 0) {
    frozenBatch = {
      ...batch,
      id: createId("batch"),
      location: "Fagyasztó",
      quantityBase: values.frozen,
      initialQuantityBase: values.frozen,
      totalPriceAtPurchase: valueForQuantity(batch, values.frozen),
      frozenAt: occurredAt,
      status: ACTIVE_STATUS,
      ...withSyncFields({})
    };
  }

  const eventFor = (type, quantityBase, financialValue = 0, createdBatchId = null) => {
    const event = {
      id: createId("event"),
      operationId,
      type,
      batchId,
      createdBatchId,
      templateId: batch.templateId,
      productName: `${template?.brand ? `${template.brand} ` : ""}${template?.name || batch.nameSnapshot}`,
      quantityBase,
      baseUnit: batch.baseUnit,
      displayUnit: batch.displayUnit,
      financialValue,
      occurredAt,
      createdAt: occurredAt,
      deletedAt: null
    };
    eventIds.push(event.id);
    return event;
  };

  await runTransaction([STORES.batches, STORES.events], async (stores) => {
    stores.batches.put(updatedBatch);
    if (frozenBatch) stores.batches.put(frozenBatch);
    if (values.consumed > 0) stores.events.put(eventFor("consumed", values.consumed));
    if (values.discarded > 0) stores.events.put(eventFor("discarded", values.discarded, valueForQuantity(batch, values.discarded)));
    if (values.frozen > 0) stores.events.put(eventFor("frozen", values.frozen, 0, frozenBatch.id));
  });

  return {
    result: { ...values, discardedValue: valueForQuantity(batch, values.discarded), frozenBatchId: frozenBatch?.id || null },
    undoToken: { beforeBatch: batch, frozenBatchId: frozenBatch?.id || null, eventIds }
  };
}

export async function undoQuantityAllocation(token) {
  if (!token?.beforeBatch) return false;
  await runTransaction([STORES.batches, STORES.events], async (stores) => {
    stores.batches.put(token.beforeBatch);
    if (token.frozenBatchId) stores.batches.delete(token.frozenBatchId);
    token.eventIds.forEach((id) => stores.events.delete(id));
  });
  return true;
}

export async function listEvents() {
  return (await getAll(STORES.events)).filter((event) => !event.deletedAt);
}

export async function listShoppingItems(includePurchased = true) {
  const [items, templates] = await Promise.all([getAll(STORES.shopping), listTemplates()]);
  const templateMap = new Map(templates.map((template) => [template.id, template]));
  return items
    .filter((item) => !item.deletedAt && (includePurchased || item.status === "active"))
    .map((item) => ({ ...item, category: item.category || templateMap.get(item.templateId)?.category || "Egyéb" }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveShoppingItem(data, existingId = null) {
  const existing = existingId ? await getOne(STORES.shopping, existingId) : null;
  const item = {
    ...(existing || {}),
    id: existing?.id || createId("shopping"),
    templateId: data.templateId || existing?.templateId || null,
    batchId: data.batchId || existing?.batchId || null,
    name: data.name.trim(),
    category: data.category || existing?.category || "Egyéb",
    quantity: Math.max(0.001, Number(data.quantity) || 1),
    unit: data.unit || "db",
    note: data.note?.trim() || "",
    status: data.status || existing?.status || "active",
    purchasedAt: data.status === "purchased" ? nowIso() : existing?.purchasedAt || null,
    ...withSyncFields(existing)
  };
  return putOne(STORES.shopping, item);
}

export async function setShoppingPurchased(id, purchased) {
  const existing = await getOne(STORES.shopping, id);
  if (!existing) return null;
  return putOne(STORES.shopping, {
    ...existing,
    status: purchased ? "purchased" : "active",
    purchasedAt: purchased ? nowIso() : null,
    ...withSyncFields(existing)
  });
}

export async function deleteShoppingItem(id) {
  const existing = await getOne(STORES.shopping, id);
  if (!existing) return false;
  await putOne(STORES.shopping, { ...existing, ...withSyncFields(existing), deletedAt: nowIso() });
  return true;
}

export async function addBatchToShopping(batchId) {
  const batch = await getBatch(batchId);
  if (!batch) throw new Error("A termék nem található.");
  const activeItems = await listShoppingItems(false);
  if (activeItems.some((item) => item.batchId === batchId)) return { item: activeItems.find((item) => item.batchId === batchId), created: false };
  const item = await saveShoppingItem({
    templateId: batch.templateId,
    batchId,
    name: `${batch.template?.brand ? `${batch.template.brand} ` : ""}${batch.template?.name || batch.nameSnapshot}`,
    category: batch.template?.category || "Egyéb",
    quantity: 1,
    unit: batch.displayUnit,
    note: ""
  });
  return { item, created: true };
}
