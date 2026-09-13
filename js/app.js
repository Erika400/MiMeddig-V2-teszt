import {
  addDaysIso,
  calculateStatistics,
  compatibleUnits,
  formatMoney,
  formatQuantity,
  fromBaseQuantity,
  quantityStep,
  todayIso,
  toBaseQuantity,
  unitDefinition,
  validateAllocation,
  valueForQuantity
} from "./domain.js?v=23";
import {
  addBatchToShopping,
  applyQuantityAllocation,
  deleteBatch,
  deleteShoppingItem,
  ensureDefaultSettings,
  getBatch,
  getSettings,
  getTemplate,
  listActiveBatches,
  listEvents,
  listShoppingItems,
  listTemplates,
  saveProduct,
  saveShoppingItem,
  setShoppingPurchased,
  undoQuantityAllocation
} from "./repository.js?v=25";
import {
  escapeHtml,
  fullProductName,
  renderHome,
  renderInventory,
  renderProductDetail,
  renderShopping,
  renderStatistics
} from "./render.js?v=33";
import { confirmProduct, inventoryDefaultsFromCatalog, lookupProductByBarcode, normalizeBarcode, rememberManualProduct } from "./product-catalog.js?v=2";
import { cameraScannerSupported, startCameraScanner, stopCameraScanner } from "./scanner.js?v=1";

const state = {
  batches: [],
  templates: [],
  events: [],
  shopping: [],
  settings: null,
  screen: "home",
  selectedBatchId: null,
  selectedLocation: "all",
  search: "",
  quantityBatchId: null,
  purchasedItemId: null,
  pendingShoppingItemId: null,
  shoppingSort: "category",
  returnScreen: "home",
  undoAction: null,
  toastTimer: null,
  scannerProduct: null,
  scannerBarcode: "",
  pendingCatalogProduct: null,
  pendingCatalogManual: false,
  scannerReturnScreen: "home"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function setGreeting() {
  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Szép estét" : hour < 10 ? "Jó reggelt" : hour < 18 ? "Jó napot" : "Jó estét";
  const displayName = state.settings?.displayName?.trim() || "Erika";
  $("#homeGreeting").textContent = `${greeting}, ${displayName}!`;
  $("#homeDate").textContent = new Intl.DateTimeFormat("hu-HU", { month: "long", day: "numeric", weekday: "long" }).format(new Date());
}

async function refreshData() {
  [state.batches, state.templates, state.events, state.shopping, state.settings] = await Promise.all([
    listActiveBatches(),
    listTemplates(),
    listEvents(),
    listShoppingItems(),
    getSettings()
  ]);
  setGreeting();
  const stats = calculateStatistics(state.events);
  renderHome({ batches: state.batches, shopping: state.shopping, stats, settings: state.settings });
  renderInventory({
    batches: state.batches,
    selectedLocation: state.selectedLocation,
    sort: $("#sortProducts").value,
    group: $("#groupProducts").value,
    settings: state.settings,
    search: state.search
  });
  renderShopping(state.shopping, state.shoppingSort);
  $$('[data-shopping-sort]').forEach((button) => {
    const active = button.dataset.shoppingSort === state.shoppingSort;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderStatistics(stats, state.settings);
  const mostRecent = [...state.templates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  $("#repeatRecentHint").textContent = mostRecent ? `${mostRecent.brand ? `${mostRecent.brand} ` : ""}${mostRecent.name}` : "Korábbi termék";
  if (state.selectedBatchId) {
    const selected = state.batches.find((batch) => batch.id === state.selectedBatchId);
    if (selected) renderProductDetail(selected, state.settings);
  }
}

function showScreen(screen) {
  if (state.screen === "add" && screen !== "add") state.pendingShoppingItemId = null;
  if (state.screen === "scanner" && screen !== "scanner") stopCameraScanner($("#scannerVideo"));
  state.screen = screen;
  $$("[data-screen]").forEach((element) => {
    const active = element.dataset.screen === screen;
    element.hidden = !active;
    element.classList.toggle("is-active", active);
  });
  $$("[data-nav-screen]").forEach((button) => button.classList.toggle("is-active", button.dataset.navScreen === screen));
  window.scrollTo({ top: 0, behavior: "instant" });
}

function showToast(message, undoAction = null) {
  clearTimeout(state.toastTimer);
  state.undoAction = undoAction;
  $("#toastMessage").textContent = message;
  $("#toastUndo").hidden = !undoAction;
  $("#toast").hidden = false;
  state.toastTimer = setTimeout(() => {
    $("#toast").hidden = true;
    state.undoAction = null;
  }, undoAction ? 8000 : 3500);
}

function closeToast() {
  clearTimeout(state.toastTimer);
  $("#toast").hidden = true;
  state.undoAction = null;
}

function confirmAction(title, message, confirmLabel = "Igen, törlöm") {
  const dialog = $("#confirmDialog");
  $("#confirmTitle").textContent = title;
  $("#confirmMessage").textContent = message;
  dialog.querySelector('[value="confirm"]').textContent = confirmLabel;
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
  });
}

function locationOptions(selected = "") {
  const locations = [...new Set([...(state.settings?.defaultLocations || []), ...state.batches.map((batch) => batch.location)])];
  if (selected && !locations.includes(selected)) locations.push(selected);
  $("#productLocation").innerHTML = locations.map((location) => `<option value="${escapeHtml(location)}">${escapeHtml(location)}</option>`).join("") + '<option value="__custom__">+ Egyéb hely</option>';
}

function setFormField(selector, value = "") {
  $(selector).value = value ?? "";
}

function resetScannerResult() {
  state.scannerProduct = null;
  state.scannerBarcode = "";
  $("#scannerStatus").textContent = "";
  $("#barcodeResult").hidden = true;
  $("#barcodeResultImage").hidden = true;
  $("#barcodeResultActions").hidden = false;
  $("#addUnknownBarcode").hidden = true;
}

function openScanner() {
  state.scannerReturnScreen = state.screen === "scanner" ? "home" : state.screen;
  stopCameraScanner($("#scannerVideo"));
  $("#barcodeLookupForm").reset();
  resetScannerResult();
  const supported = cameraScannerSupported();
  $("#startScannerCamera").textContent = "Kamera bekapcsolása";
  $("#startScannerCamera").disabled = !supported;
  $("#scannerSupport").textContent = supported
    ? "A kamera engedélyét csak a leolvasáshoz kérjük."
    : "Ezen az eszközön a kamerás felismerés nem érhető el, de a kódot beírhatod kézzel.";
  $("#scannerPlaceholder").hidden = false;
  showScreen("scanner");
  setTimeout(() => supported ? $("#startScannerCamera").focus() : $("#barcodeLookupInput").focus(), 0);
}

function showScannerProduct(product, stage = "external") {
  state.scannerProduct = product;
  state.scannerBarcode = product.barcode;
  $("#barcodeResult").hidden = false;
  $("#barcodeResultActions").hidden = false;
  $("#addUnknownBarcode").hidden = true;
  $("#barcodeResultKicker").textContent = stage === "cache" ? "Korábbról már ismerem" : "Ezt találtam";
  $("#barcodeResultName").textContent = `${product.brand ? `${product.brand} ` : ""}${product.name}`;
  $("#barcodeResultPackage").textContent = product.packageText || (product.packageQuantity ? `${product.packageQuantity} ${product.packageUnit}` : "A kiszerelés nincs megadva");
  $("#barcodeResultNote").textContent = "A találatot mentés előtt ellenőrizd.";
  const image = $("#barcodeResultImage");
  image.hidden = !product.imageUrl;
  image.src = product.imageUrl || "";
  image.alt = product.imageUrl ? `${product.name} termékképe` : "";
  image.onerror = () => { image.hidden = true; };
  $("#scannerStatus").textContent = "Ellenőrizd, hogy valóban ezt a terméket tartod a kezedben.";
}

function showUnknownBarcode(barcode, unavailable = false) {
  state.scannerProduct = null;
  state.scannerBarcode = barcode;
  $("#barcodeResult").hidden = false;
  $("#barcodeResultImage").hidden = true;
  $("#barcodeResultActions").hidden = true;
  $("#addUnknownBarcode").hidden = false;
  $("#barcodeResultKicker").textContent = unavailable ? "Most nincs hálózati találat" : "Ezt még nem ismerem";
  $("#barcodeResultName").textContent = barcode;
  $("#barcodeResultPackage").textContent = "Add meg röviden a termék nevét, márkáját és kiszerelését.";
  $("#barcodeResultNote").textContent = unavailable ? "A helyi termékek továbbra is használhatók." : "A megadott adat először csak ezen az eszközön marad.";
  $("#scannerStatus").textContent = unavailable ? "Az online keresés nem sikerült, de kézzel folytathatod." : "Nem találtam egyezést a helyi vagy külső katalógusban.";
}

async function findBarcode(value) {
  const button = $("#lookupBarcodeButton");
  button.disabled = true;
  $("#scannerStatus").textContent = "Keresem a terméket…";
  $("#barcodeResult").hidden = true;
  stopCameraScanner($("#scannerVideo"));
  $("#scannerPlaceholder").hidden = false;
  try {
    const barcode = normalizeBarcode(value);
    $("#barcodeLookupInput").value = barcode;
    const result = await lookupProductByBarcode(barcode);
    if (result.status === "found") showScannerProduct(result.product, result.stage);
    else showUnknownBarcode(barcode, result.status === "unavailable");
  } catch (error) {
    $("#scannerStatus").textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function submitBarcodeLookup(event) {
  event.preventDefault();
  return findBarcode($("#barcodeLookupInput").value);
}

async function startScannerCameraFlow() {
  const button = $("#startScannerCamera");
  button.disabled = true;
  $("#scannerStatus").textContent = "Kamera indítása…";
  try {
    await startCameraScanner($("#scannerVideo"), (barcode) => findBarcode(barcode));
    $("#scannerPlaceholder").hidden = true;
    $("#scannerStatus").textContent = "Tartsd mozdulatlanul a vonalkódot a keretben.";
    button.textContent = "Kamera aktív";
  } catch (error) {
    $("#scannerPlaceholder").hidden = false;
    $("#scannerStatus").textContent = error.name === "NotAllowedError"
      ? "Nem kaptunk kameraengedélyt. A kódot alább kézzel is beírhatod."
      : error.message || "A kamera nem indítható el.";
    button.disabled = false;
  }
}

async function useScannerProduct(correct = false) {
  if (!state.scannerProduct) return;
  const product = correct ? state.scannerProduct : await confirmProduct(state.scannerProduct);
  return openProductForm({ catalogProduct: product, catalogManual: correct });
}

async function openProductForm({ batch = null, template = null, catalogProduct = null, catalogManual = false, customLocation = false, shoppingItemId = null } = {}) {
  state.pendingShoppingItemId = shoppingItemId;
  state.pendingCatalogProduct = catalogProduct;
  state.pendingCatalogManual = catalogManual;
  state.returnScreen = state.screen === "add" ? "home" : state.screen;
  $("#productForm").reset();
  $("#editingBatchId").value = batch?.id || "";
  $("#productTemplateId").value = template?.id || batch?.templateId || "";
  $("#formEyebrow").textContent = batch ? "Készlettétel szerkesztése" : catalogManual ? "Vonalkód kézi azonosítása" : catalogProduct ? "Vonalkód alapján" : template ? "Gyors újrafelvitel" : "Gyors felvitel";
  $("#formTitle").textContent = batch ? "Termék szerkesztése" : catalogManual ? "Termék adatainak megadása" : catalogProduct ? "Felismert termék" : template ? "Újra megvettem" : "Új termék";
  $("#formSubtitle").textContent = batch ? "A módosítás csak ezt a külön készlettételt érinti." : catalogProduct ? "Ellenőrizd az adatokat, majd add meg a lejáratot." : "A név, a hely és a dátum elég.";
  const source = batch?.template || template || catalogProduct || {};
  const chosenLocation = batch?.location || source.defaultLocation || state.settings.defaultLocations[0];
  locationOptions(chosenLocation);
  setFormField("#productName", source.name || "");
  setFormField("#productBrand", source.brand || "");
  setFormField("#productCategory", source.category || "Egyéb");
  setFormField("#productSubcategory", source.subcategory === "Egyéb" ? "" : source.subcategory || "");
  setFormField("#productLocation", customLocation ? "__custom__" : chosenLocation);
  setFormField("#customLocation", "");
  $("#customLocationField").hidden = !customLocation;
  setFormField("#productExpiry", batch?.expiryDate || addDaysIso(7));
  const catalogInventory = inventoryDefaultsFromCatalog(catalogProduct);
  const displayUnit = batch?.displayUnit || (catalogProduct ? catalogInventory.unit : source.displayUnit) || "db";
  setFormField("#productUnit", displayUnit);
  setFormField("#productQuantity", batch
    ? fromBaseQuantity(batch.quantityBase, displayUnit)
    : catalogProduct
      ? catalogInventory.quantity
      : source.defaultQuantityBase
        ? fromBaseQuantity(source.defaultQuantityBase, displayUnit)
        : 1);
  const suggestedPrice = batch
    ? batch.totalPriceAtPurchase
    : Number(source.lastPrice) > 0 ? source.lastPrice : "";
  setFormField("#productPrice", suggestedPrice);
  setFormField("#productBarcode", source.barcode || "");
  setFormField("#productPackageQuantity", source.packageQuantity || "");
  setFormField("#productPackageUnit", source.packageUnit || "g");
  setFormField("#productCatalogSource", source.catalogSource || source.source || "");
  setFormField("#productCatalogSourceLabel", source.catalogSourceLabel || source.sourceLabel || "");
  setFormField("#productCatalogProductId", source.catalogProductId || source.barcode || "");
  setFormField("#productImageUrl", source.imageUrl || "");
  setFormField("#productNote", batch?.note || "");
  const recognized = Boolean(source.barcode);
  $("#recognizedProductNote").hidden = !recognized;
  $("#recognizedProductTitle").textContent = catalogManual ? "Ezt a vonalkódot most tanítod meg" : `${source.brand ? `${source.brand} ` : ""}${source.name || source.barcode}`;
  $("#recognizedProductSource").textContent = catalogManual
    ? "Mentés után ezen az eszközön már automatikusan felismerjük."
    : source.packageText || (source.packageQuantity ? `${source.packageQuantity} ${source.packageUnit}` : "Az adatok automatikusan kitöltve");
  showScreen("add");
  setTimeout(() => catalogProduct && !catalogManual ? $("#productExpiry").focus() : $("#productName").focus(), 0);
}

async function submitProduct(event) {
  event.preventDefault();
  const customLocation = $("#productLocation").value === "__custom__";
  const location = customLocation ? $("#customLocation").value.trim() : $("#productLocation").value;
  if (!location) {
    showToast("Adj nevet az egyéb helynek.");
    $("#customLocation").focus();
    return;
  }
  const unit = $("#productUnit").value;
  try {
    const barcode = $("#productBarcode").value.trim() ? normalizeBarcode($("#productBarcode").value) : "";
    let catalogSource = $("#productCatalogSource").value;
    let catalogSourceLabel = $("#productCatalogSourceLabel").value;
    let catalogProductId = $("#productCatalogProductId").value;
    let imageUrl = $("#productImageUrl").value;
    const packageQuantity = $("#productPackageQuantity").value;
    const packageUnit = $("#productPackageUnit").value;
    if (barcode && (state.pendingCatalogManual || !catalogSource)) {
      const remembered = await rememberManualProduct({
        barcode,
        brand: $("#productBrand").value.trim(),
        name: $("#productName").value.trim(),
        category: $("#productCategory").value,
        subcategory: $("#productSubcategory").value.trim() || "Egyéb",
        packageQuantity: Math.max(0, Number(packageQuantity) || 0) || null,
        packageUnit,
        packageText: packageQuantity ? `${packageQuantity} ${packageUnit}` : "",
        imageUrl
      });
      catalogSource = remembered.source;
      catalogSourceLabel = remembered.sourceLabel;
      catalogProductId = remembered.barcode;
      imageUrl = remembered.imageUrl || "";
    }
    const result = await saveProduct({
      templateId: $("#productTemplateId").value || null,
      name: $("#productName").value,
      brand: $("#productBrand").value,
      category: $("#productCategory").value,
      subcategory: $("#productSubcategory").value,
      location,
      quantity: $("#productQuantity").value,
      unit,
      baseUnit: unitDefinition(unit).baseUnit,
      totalPrice: $("#productPrice").value,
      expiryDate: $("#productExpiry").value,
      barcode,
      packageQuantity,
      packageUnit,
      packageText: state.pendingCatalogProduct?.packageText || (packageQuantity ? `${packageQuantity} ${packageUnit}` : ""),
      catalogSource,
      catalogSourceLabel,
      catalogProductId,
      imageUrl,
      note: $("#productNote").value
    }, $("#editingBatchId").value || null);
    state.selectedBatchId = result.batch.id;
    const purchasedFromShopping = state.pendingShoppingItemId;
    if (purchasedFromShopping) {
      await setShoppingPurchased(purchasedFromShopping, true);
      state.pendingShoppingItemId = null;
    }
    state.pendingCatalogProduct = null;
    state.pendingCatalogManual = false;
    await refreshData();
    renderProductDetail(await getBatch(result.batch.id), state.settings);
    showScreen("product-detail");
    showToast(purchasedFromShopping ? "A megvett termék bekerült a készletbe." : $("#editingBatchId").value ? "A termék adatai frissültek." : "A termék helyben elmentve.");
  } catch (error) {
    showToast(error.message);
  }
}

function activeBatch() {
  return state.batches.find((batch) => batch.id === state.selectedBatchId) || null;
}

async function openDetail(batchId) {
  const batch = state.batches.find((item) => item.id === batchId) || await getBatch(batchId);
  if (!batch) return showToast("Ez a készlettétel már nem található.");
  state.selectedBatchId = batch.id;
  renderProductDetail(batch, state.settings);
  showScreen("product-detail");
}

function setQuantityUnitOptions(batch) {
  const units = compatibleUnits(batch.baseUnit);
  ["consumed", "frozen", "discarded"].forEach((kind) => {
    const select = $(`#${kind}Unit`);
    select.innerHTML = units.map((unit) => `<option value="${unit}">${unit}</option>`).join("");
    select.value = units.includes(batch.displayUnit) ? batch.displayUnit : units[0];
    select.dataset.previousUnit = select.value;
    const input = $(`#${kind}Amount`);
    input.value = 0;
    input.step = quantityStep(select.value);
  });
}

function orderQuantityRows(primaryAction = null) {
  const actions = ["consumed", "frozen", "discarded"];
  const orderedActions = actions.includes(primaryAction)
    ? [primaryAction, ...actions.filter((action) => action !== primaryAction)]
    : actions;
  const grid = $(".quantity-split-grid");
  orderedActions.forEach((action) => grid.append($(`.quantity-${action}`)));
}

function quantityValues() {
  return Object.fromEntries(["consumed", "frozen", "discarded"].map((kind) => [kind, toBaseQuantity($(`#${kind}Amount`).value || 0, $(`#${kind}Unit`).value)]));
}

function updateQuantityPreview() {
  const batch = state.batches.find((item) => item.id === state.quantityBatchId);
  if (!batch) return;
  try {
    const quantities = quantityValues();
    const allocation = validateAllocation(batch.quantityBase, quantities);
    ["consumed", "frozen", "discarded"].forEach((kind) => {
      const otherTotal = Object.entries(quantities).filter(([key]) => key !== kind).reduce((sum, [, value]) => sum + value, 0);
      const maximumBase = Math.max(0, batch.quantityBase - otherTotal);
      $(`#${kind}Amount`).max = fromBaseQuantity(maximumBase, $(`#${kind}Unit`).value);
    });
    $("#quantityRemaining").textContent = `Megmarad: ${formatQuantity(allocation.remaining, batch.displayUnit)} a jelenlegi helyén`;
    $("#quantityRemaining").classList.remove("is-invalid");
    $("#quantityError").hidden = true;
    const discarded = quantities.discarded;
    $("#liveWasteEstimate").hidden = discarded <= 0;
    $("#liveWasteEstimate").textContent = `Becsült kidobási veszteség: ${formatMoney(valueForQuantity(batch, discarded), state.settings.currency)}`;
    $("#saveQuantitySplit").disabled = allocation.allocated <= 0;
  } catch (error) {
    $("#quantityRemaining").textContent = "A megadott összegek meghaladják a teljes mennyiséget.";
    $("#quantityRemaining").classList.add("is-invalid");
    $("#quantityError").textContent = error.message;
    $("#quantityError").hidden = false;
    $("#saveQuantitySplit").disabled = true;
  }
}

function convertQuantityUnit(kind) {
  const select = $(`#${kind}Unit`);
  const input = $(`#${kind}Amount`);
  const previousUnit = select.dataset.previousUnit || select.value;
  const quantityBase = toBaseQuantity(input.value || 0, previousUnit);
  input.value = fromBaseQuantity(quantityBase, select.value);
  input.step = quantityStep(select.value);
  select.dataset.previousUnit = select.value;
  updateQuantityPreview();
}

function handleDecimalComma(event) {
  const input = event.currentTarget;
  if (event.key === ",") {
    event.preventDefault();
    if (!input.value.includes(".")) input.dataset.decimalPending = "true";
    return;
  }
  if (input.dataset.decimalPending === "true" && /^\d$/.test(event.key)) {
    event.preventDefault();
    input.value = `${input.value || "0"}.${event.key}`;
    delete input.dataset.decimalPending;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (["Backspace", "Delete", "Escape", "Tab", "Enter"].includes(event.key)) delete input.dataset.decimalPending;
}

function handleDecimalPaste(event) {
  const pasted = event.clipboardData?.getData("text")?.trim().replace(/\s/g, "").replace(",", ".");
  if (!pasted || !/^\d*(?:\.\d+)?$/.test(pasted)) return;
  event.preventDefault();
  event.currentTarget.value = pasted;
  event.currentTarget.dispatchEvent(new Event("input", { bubbles: true }));
}

function openQuantitySheet(batchId, action = null) {
  const batch = state.batches.find((item) => item.id === batchId);
  if (!batch) return showToast("Ez a termék már nincs készleten.");
  state.quantityBatchId = batchId;
  orderQuantityRows(action);
  setQuantityUnitOptions(batch);
  if (action) $(`#${action}Amount`).value = fromBaseQuantity(batch.quantityBase, $(`#${action}Unit`).value);
  $("#quantityTitle").textContent = fullProductName(batch);
  $("#quantityBackdrop").hidden = false;
  $("#quantitySheet").hidden = false;
  updateQuantityPreview();
}

function closeQuantitySheet() {
  $("#quantityBackdrop").hidden = true;
  $("#quantitySheet").hidden = true;
  state.quantityBatchId = null;
}

async function saveQuantitySplit() {
  try {
    const result = await applyQuantityAllocation(state.quantityBatchId, quantityValues());
    closeQuantitySheet();
    await refreshData();
    const batchStillActive = state.batches.some((batch) => batch.id === state.selectedBatchId);
    showScreen(batchStillActive && state.screen === "product-detail" ? "product-detail" : "home");
    showToast("A mennyiségek pontosan frissültek.", async () => {
      await undoQuantityAllocation(result.undoToken);
      await refreshData();
      showToast("A műveletet visszavontuk.");
    });
  } catch (error) {
    $("#quantityError").textContent = error.message;
    $("#quantityError").hidden = false;
  }
}

async function repeatMostRecent() {
  const template = [...state.templates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!template) return showToast("Még nincs korábbi termék, amit újra felvehetnél.");
  openProductForm({ template });
}

async function addShopping(event) {
  event.preventDefault();
  await saveShoppingItem({ name: $("#shoppingName").value, category: $("#shoppingCategory").value, quantity: 1, unit: "db", note: "" });
  $("#shoppingForm").reset();
  await refreshData();
  showToast("Hozzáadtuk a bevásárlólistához.");
}

function openPurchaseSheet(item) {
  state.purchasedItemId = item.id;
  $("#purchasedItemName").textContent = item.name;
  $("#purchaseBackdrop").hidden = false;
  $("#purchaseSheet").hidden = false;
}

function closePurchaseSheet() {
  $("#purchaseBackdrop").hidden = true;
  $("#purchaseSheet").hidden = true;
  state.purchasedItemId = null;
}

async function cancelPurchaseSheet() {
  const itemId = state.purchasedItemId;
  const item = state.shopping.find((entry) => entry.id === itemId);
  closePurchaseSheet();
  if (item?.status === "purchased") {
    await setShoppingPurchased(itemId, false);
    await refreshData();
  }
}

async function addPurchasedToInventory() {
  const item = state.shopping.find((entry) => entry.id === state.purchasedItemId);
  if (!item) return closePurchaseSheet();
  const template = item.templateId ? await getTemplate(item.templateId) : null;
  closePurchaseSheet();
  await openProductForm({ template, shoppingItemId: item.id });
  $("#formEyebrow").textContent = "Megvásárolt tétel";
  $("#formTitle").textContent = "Hozzáadás a készlethez";
  $("#formSubtitle").textContent = "Csak a Mentés után kerül a lejáratfigyelőbe.";
  if (!template) {
    setFormField("#productName", item.name);
    setFormField("#productCategory", item.category || "Egyéb");
    setFormField("#productQuantity", item.quantity);
    if ([...$("#productUnit").options].some((option) => option.value === item.unit)) setFormField("#productUnit", item.unit);
  }
}

async function onlyCheckShoppingItem() {
  const itemId = state.purchasedItemId;
  closePurchaseSheet();
  if (!itemId) return;
  await setShoppingPurchased(itemId, true);
  await refreshData();
  showToast("A tételt kipipáltad. Nem került a készletbe.");
}

async function openShoppingEdit(itemId) {
  const item = state.shopping.find((entry) => entry.id === itemId);
  if (!item) return;
  setFormField("#shoppingEditId", item.id);
  setFormField("#shoppingEditName", item.name);
  setFormField("#shoppingEditCategory", item.category || "Egyéb");
  setFormField("#shoppingEditQuantity", item.quantity);
  setFormField("#shoppingEditUnit", item.unit);
  setFormField("#shoppingEditNote", ["Kézzel hozzáadva", "Készletből hozzáadva"].includes(item.note) ? "" : item.note);
  $("#shoppingEditDialog").showModal();
}

async function submitShoppingEdit(event) {
  event.preventDefault();
  await saveShoppingItem({
    name: $("#shoppingEditName").value,
    category: $("#shoppingEditCategory").value,
    quantity: $("#shoppingEditQuantity").value,
    unit: $("#shoppingEditUnit").value,
    note: $("#shoppingEditNote").value
  }, $("#shoppingEditId").value);
  $("#shoppingEditDialog").close();
  await refreshData();
  showToast("A listaelem frissült.");
}

async function handleClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.hasAttribute("data-open-scanner")) return openScanner();
  if (button.id === "startScannerCamera") return startScannerCameraFlow();
  if (button.id === "closeScanner") return showScreen(state.scannerReturnScreen || "home");
  if (button.id === "confirmBarcodeResult") return useScannerProduct(false);
  if (button.id === "correctBarcodeResult") return useScannerProduct(true);
  if (button.id === "addUnknownBarcode") return openProductForm({ catalogProduct: { barcode: state.scannerBarcode, name: "", brand: "", category: "Egyéb", packageUnit: "g", source: "mimeddig-local", sourceLabel: "Saját, helyi termékadat" }, catalogManual: true });
  if (button.dataset.navScreen === "add" || button.hasAttribute("data-open-add")) return openProductForm();
  if (button.dataset.navScreen) return showScreen(button.dataset.navScreen);
  if (button.dataset.goScreen) {
    if (button.hasAttribute("data-urgent-only")) {
      state.selectedLocation = "all";
      state.search = "";
    }
    return showScreen(button.dataset.goScreen);
  }
  if (button.dataset.demoMessage) return showToast(button.dataset.demoMessage);
  if (button.dataset.location !== undefined) {
    state.selectedLocation = button.dataset.location;
    renderInventory({ batches: state.batches, selectedLocation: state.selectedLocation, sort: $("#sortProducts").value, group: $("#groupProducts").value, settings: state.settings, search: state.search });
    return showScreen("inventory");
  }
  if (button.hasAttribute("data-open-custom-location")) return openProductForm({ customLocation: true });
  if (button.dataset.batchDetail) return openDetail(button.dataset.batchDetail);
  if (button.dataset.quantityAction) return openQuantitySheet(button.dataset.batchId || state.selectedBatchId, button.dataset.quantityAction);
  if (button.dataset.detailAction) return openQuantitySheet(state.selectedBatchId, button.dataset.detailAction);
  if (button.id === "repeatRecentButton") return repeatMostRecent();
  if (button.id === "repeatProductButton") return openProductForm({ template: activeBatch()?.template });
  if (button.id === "editProductButton") return openProductForm({ batch: activeBatch() });
  if (button.id === "closeProductForm" || button.id === "cancelProductForm") return showScreen(state.returnScreen || "home");
  if (button.id === "deleteProductButton") {
    const batch = activeBatch();
    if (!batch) return;
    const approved = await confirmAction("Törlöd ezt a készlettételt?", `${fullProductName(batch)} eltűnik az aktív készletből.`);
    if (approved) {
      await deleteBatch(batch.id);
      state.selectedBatchId = null;
      await refreshData();
      showScreen("inventory");
      showToast("A készlettételt töröltük.");
    }
    return;
  }
  if (button.id === "addDetailToShopping") {
    const result = await addBatchToShopping(state.selectedBatchId);
    await refreshData();
    return showToast(result.created ? "Hozzáadtuk a bevásárlólistához." : "Ez a tétel már rajta van a listán.");
  }
  if (button.id === "saveQuantitySplit") return saveQuantitySplit();
  if (button.id === "closeQuantitySheet" || button.id === "quantityBackdrop") return closeQuantitySheet();
  if (button.id === "addPurchasedToInventory") return addPurchasedToInventory();
  if (button.id === "onlyCheckShoppingItem") return onlyCheckShoppingItem();
  if (button.id === "cancelPurchase" || button.id === "purchaseBackdrop") return cancelPurchaseSheet();
  if (button.dataset.shoppingSort) {
    state.shoppingSort = button.dataset.shoppingSort;
    $$('[data-shopping-sort]').forEach((sortButton) => {
      const active = sortButton.dataset.shoppingSort === state.shoppingSort;
      sortButton.classList.toggle("is-active", active);
      sortButton.setAttribute("aria-pressed", String(active));
    });
    return renderShopping(state.shopping, state.shoppingSort);
  }
  if (button.dataset.shoppingEdit) return openShoppingEdit(button.dataset.shoppingEdit);
  if (button.dataset.shoppingDelete) {
    const item = state.shopping.find((entry) => entry.id === button.dataset.shoppingDelete);
    const approved = await confirmAction("Törlöd a listaelemet?", item?.name || "A kiválasztott listaelem törlődik.");
    if (approved) {
      await deleteShoppingItem(button.dataset.shoppingDelete);
      await refreshData();
      showToast("A listaelemet töröltük.");
    }
    return;
  }
  if (button.id === "cancelShoppingEdit") return $("#shoppingEditDialog").close();
  if (button.id === "toastUndo" && state.undoAction) {
    const action = state.undoAction;
    closeToast();
    return action();
  }
  if (button.dataset.dateOffset !== undefined) {
    $("#productExpiry").value = addDaysIso(Number(button.dataset.dateOffset));
    return;
  }
  if (button.id === "inventorySearchButton") {
    const term = window.prompt("Melyik terméket keresed?", state.search);
    if (term === null) return;
    state.search = term.trim();
    return renderInventory({ batches: state.batches, selectedLocation: state.selectedLocation, sort: $("#sortProducts").value, group: $("#groupProducts").value, settings: state.settings, search: state.search });
  }
}

async function handleChange(event) {
  if (event.target.id === "productLocation") {
    $("#customLocationField").hidden = event.target.value !== "__custom__";
    if (event.target.value === "__custom__") $("#customLocation").focus();
    return;
  }
  if (event.target.id === "sortProducts" || event.target.id === "groupProducts") {
    return renderInventory({ batches: state.batches, selectedLocation: state.selectedLocation, sort: $("#sortProducts").value, group: $("#groupProducts").value, settings: state.settings, search: state.search });
  }
  if (event.target.dataset.shoppingToggle) {
    const purchased = event.target.checked;
    const item = state.shopping.find((entry) => entry.id === event.target.dataset.shoppingToggle);
    if (purchased && item) {
      event.target.checked = false;
      openPurchaseSheet(item);
      return;
    }
    await setShoppingPurchased(event.target.dataset.shoppingToggle, false);
    await refreshData();
  }
}

async function init() {
  try {
    await ensureDefaultSettings();
    await refreshData();
    document.addEventListener("click", handleClick);
    document.addEventListener("change", handleChange);
    ["consumed", "frozen", "discarded"].forEach((kind) => {
      const amountInput = $(`#${kind}Amount`);
      amountInput.addEventListener("input", updateQuantityPreview);
      amountInput.addEventListener("keydown", handleDecimalComma);
      amountInput.addEventListener("paste", handleDecimalPaste);
      $(`#${kind}Unit`).addEventListener("change", () => convertQuantityUnit(kind));
    });
    $("#productForm").addEventListener("submit", submitProduct);
    $("#barcodeLookupForm").addEventListener("submit", submitBarcodeLookup);
    $("#shoppingForm").addEventListener("submit", addShopping);
    $("#shoppingEditForm").addEventListener("submit", submitShoppingEdit);
    $("#quantityBackdrop").addEventListener("click", closeQuantitySheet);
    $("#purchaseBackdrop").addEventListener("click", cancelPurchaseSheet);
    $("#productPackageQuantity").addEventListener("keydown", handleDecimalComma);
    $("#productPackageQuantity").addEventListener("paste", handleDecimalPaste);
    window.addEventListener("pagehide", () => stopCameraScanner($("#scannerVideo")));
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch((error) => console.warn("A service worker nem indult el:", error));
  } catch (error) {
    console.error(error);
    $("#homeSummary").textContent = "A helyi adatbázis nem indult el. Próbáld frissíteni az oldalt.";
    showToast(error.message || "Ismeretlen indítási hiba.");
  }
}

init();
