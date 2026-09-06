import {
  expiryState,
  formatDate,
  formatMoney,
  formatQuantity,
  parseLocalDate
} from "./domain.js?v=22";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function productName(batch) {
  return batch.template?.name || batch.nameSnapshot || "Névtelen termék";
}

export function fullProductName(batch) {
  const brand = batch.template?.brand || batch.brandSnapshot || "";
  return `${brand ? `${brand} ` : ""}${productName(batch)}`;
}

export function productSymbol(batch) {
  const searchable = `${batch.template?.category || ""} ${batch.template?.subcategory || ""} ${productName(batch)}`.toLocaleLowerCase("hu-HU");
  if (/csirke|tyúk/.test(searchable)) return "🐔";
  if (/marha|borjú/.test(searchable)) return "🐄";
  if (/sertés|disznó|sonka/.test(searchable)) return "🐖";
  if (/hal|lazac|tonhal/.test(searchable)) return "🐟";
  if (/tej|joghurt|sajt|vaj|tejtermék/.test(searchable)) return "🥛";
  if (/tojás/.test(searchable)) return "🥚";
  if (/csoki|csokoládé|cukorka|édesség|desszert/.test(searchable)) return "🍬";
  if (/ital|üdítő|gyümölcslé|szörp/.test(searchable)) return "🧃";
  if (/zöldség|saláta|paprika/.test(searchable)) return "🥬";
  if (/gyümölcs|alma|banán/.test(searchable)) return "🍎";
  if (/pék|kenyér|zsemle/.test(searchable)) return "🥖";
  if (/rizs|tészta|liszt|cukor|alapélelmiszer/.test(searchable)) return "🍚";
  if (/gyógyszer/.test(searchable)) return "💊";
  if (/kozmetikum|sampon|krém/.test(searchable)) return "🧴";
  return "📦";
}

function emptyState(message, button = "") {
  return `<div class="empty-state"><span aria-hidden="true">✓</span><p>${escapeHtml(message)}</p>${button}</div>`;
}

function timelineMarkup(batch, extraClass = "") {
  const expiry = expiryState(batch.expiryDate);
  const start = parseLocalDate(batch.purchaseDate || batch.createdAt?.slice(0, 10));
  const end = parseLocalDate(batch.expiryDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const total = start && end ? Math.max(1, end - start) : 1;
  const elapsed = start ? Math.max(0, today - start) : 0;
  const progress = Math.min(100, Math.max(3, Math.round((elapsed / total) * 100)));
  return `<div class="expiry-timeline status-${expiry.status} ${extraClass}" style="--timeline-progress:${progress}%" aria-label="Lejárati idő: ${escapeHtml(expiry.label)}"><div class="timeline-track"><span></span><i></i></div></div>`;
}

function productCard(batch) {
  const expiry = expiryState(batch.expiryDate);
  const brand = batch.template?.brand || batch.brandSnapshot || "";
  return `
    <article class="product-card status-${expiry.status}">
      <button class="product-open" type="button" data-batch-detail="${escapeHtml(batch.id)}">
        <span class="product-emoji" aria-hidden="true">${productSymbol(batch)}</span>
        <span class="product-main">
          ${brand ? `<span class="product-brand">${escapeHtml(brand)}</span>` : ""}
          <strong>${escapeHtml(productName(batch))}</strong>
          ${timelineMarkup(batch)}
          <span class="product-meta"><span>${escapeHtml(formatQuantity(batch.quantityBase, batch.displayUnit))}</span><span>${escapeHtml(batch.location)}</span><b class="expiry-label">${escapeHtml(expiry.label)}</b></span>
        </span>
      </button>
      <button class="product-menu" type="button" data-batch-detail="${escapeHtml(batch.id)}" aria-label="Részletek">›</button>
    </article>`;
}

function rescueCard(batch) {
  const expiry = expiryState(batch.expiryDate);
  const appearance = expiry.status === "expired" ? "review" : expiry.status;
  return `
    <article class="rescue-card ${appearance}">
      <div class="rescue-product">
        <span class="product-emoji" aria-hidden="true">${productSymbol(batch)}</span>
        <button class="rescue-copy" type="button" data-batch-detail="${escapeHtml(batch.id)}">
          <strong>${escapeHtml(fullProductName(batch))}</strong>
          ${timelineMarkup(batch)}
          <span>${escapeHtml(formatQuantity(batch.quantityBase, batch.displayUnit))} · ${escapeHtml(batch.location)} · ${escapeHtml(expiry.label)}</span>
        </button>
      </div>
      <div class="rescue-actions" aria-label="Gyors műveletek">
        <button type="button" data-quantity-action="consumed" data-quick-status="consumed" data-batch-id="${escapeHtml(batch.id)}">Felhasználtam</button>
        <button type="button" data-quantity-action="frozen" data-quick-status="frozen" data-batch-id="${escapeHtml(batch.id)}">Lefagyasztom</button>
        <button type="button" data-quantity-action="discarded" data-quick-status="discarded" data-batch-id="${escapeHtml(batch.id)}">Kidobtam</button>
      </div>
    </article>`;
}

function locationIcon(kind) {
  const icons = {
    fridge: `<rect x="6" y="2.75" width="12" height="18.5" rx="3"/><path d="M6 10h12M9.25 6.2v1.9M9.25 13.2v3"/>`,
    freezer: `<path class="location-icon-soft" d="M12 3.2a8.8 8.8 0 1 0 0 17.6 8.8 8.8 0 0 0 0-17.6Z"/><path d="M12 6.6v10.8M7.3 9.3l9.4 5.4M7.3 14.7l9.4-5.4M12 6.6l-1.45 1.45M12 6.6l1.45 1.45M12 17.4l-1.45-1.45M12 17.4l1.45-1.45M7.3 9.3l1.98.53M7.3 9.3l.53-1.98M16.7 14.7l-1.98-.53M16.7 14.7l-.53 1.98"/>`,
    pantry: `<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M3.5 10.2h17M9.1 7.15h.1M14.8 7.15h.1M8 13.2h3v4H8zM14 12.5h2.8v4.7H14z"/>`,
    bath: `<path class="location-icon-soft" d="M3.3 12.2h17.4v2.1a5.2 5.2 0 0 1-5.2 5.2h-7a5.2 5.2 0 0 1-5.2-5.2v-2.1Z"/><path d="M3 12.2h18M6.2 12.2V7.8a3.3 3.3 0 0 1 6.2-1.55M6.1 19.5l-.8 1.4M17.9 19.5l.8 1.4M15.8 6.1h.1M18.1 8h.1"/>`,
    medicine: `<path class="location-icon-soft" d="m8.1 10.3 5.6 5.6-1.2 1.2a4 4 0 0 1-5.6-5.6l1.2-1.2Z"/><path d="M6.9 17.1a4 4 0 0 1 0-5.6l4.6-4.6a4 4 0 0 1 5.6 5.6l-4.6 4.6a4 4 0 0 1-5.6 0ZM8.1 10.3l5.6 5.6"/><circle cx="18.2" cy="6.1" r="2.1"/>`,
    cosmetics: `<path d="M4.2 11h5.2v10H4.2zM5.1 11V7.8l3.2-2.7V11M4.2 15.2h5.2"/><path class="location-icon-soft" d="M11.2 14.1c2.3-2.8 4.1-2.8 5.4-.7 1.4-1.8 3.2-.9 4.6.7-2.1 4.2-7.4 4.2-10 0Z"/><path d="M11.2 14.1c2.3-2.8 4.1-2.8 5.4-.7 1.4-1.8 3.2-.9 4.6.7-2.1 4.2-7.4 4.2-10 0ZM12.2 14.4c2.8.8 5.3.8 8 0"/>`,
    custom: `<path class="location-icon-soft" d="M12 21s6-5.15 6-11a6 6 0 1 0-12 0c0 5.85 6 11 6 11Z"/><path d="M12 21s6-5.15 6-11a6 6 0 1 0-12 0c0 5.85 6 11 6 11ZM9.5 10.2 12 8l2.5 2.2v3.1h-5v-3.1Z"/>`,
    add: `<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M12 8v8M8 12h8"/>`,
    all: `<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>`
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[kind] || icons.custom}</svg>`;
}

function locationAppearance(location) {
  const appearances = {
    "Hűtő": ["location-fridge", "fridge"],
    "Fagyasztó": ["location-freezer", "freezer"],
    "Kamra": ["location-pantry", "pantry"],
    "Fürdő": ["location-bath", "bath"],
    "Gyógyszerek": ["location-medicine", "medicine"],
    "Kozmetikumok": ["location-cosmetics", "cosmetics"]
  };
  const [tone, kind] = appearances[location] || ["location-custom", "custom"];
  return [tone, locationIcon(kind)];
}

export function renderHome({ batches, shopping, stats, settings }) {
  const urgent = batches
    .filter((batch) => expiryState(batch.expiryDate).days <= 3)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  document.querySelector("#homeUrgentList").innerHTML = urgent.length
    ? urgent.map(rescueCard).join("")
    : emptyState("Nincs lejárt vagy három napon belül lejáró termék.");

  const discovered = batches.map((batch) => batch.location);
  const locations = [...new Set([...(settings.defaultLocations || []), ...discovered])];
  document.querySelector("#homeLocations").innerHTML = locations.map((location) => {
    const count = batches.filter((batch) => batch.location === location).length;
    const [tone, icon] = locationAppearance(location);
    return `<button class="location-card ${tone}" type="button" data-location="${escapeHtml(location)}"><span class="location-icon" aria-hidden="true">${icon}</span><strong class="location-name">${escapeHtml(location)}</strong><span class="location-meta">${count} tétel</span></button>`;
  }).join("") + `<button class="location-card location-other add-location-card" type="button" data-open-custom-location><span class="location-icon" aria-hidden="true">${locationIcon("add")}</span><strong class="location-name">Egyéb hely</strong><span class="location-meta">Saját hely megadása</span></button>`;

  const activeShopping = shopping.filter((item) => item.status === "active");
  document.querySelector("#shoppingPreviewCount").textContent = activeShopping.length
    ? `${activeShopping.length} tétel vár a listán`
    : "A lista üres";
  document.querySelector("#homeWasteValue").textContent = `${formatMoney(stats.monthlyDiscardedValue, settings.currency)} kidobási veszteség`;
  document.querySelector("#homeSummary").textContent = urgent.length
    ? `${urgent.length} termékre érdemes most ránézned.`
    : "Minden rendben, nincs sürgős teendőd.";
}

export function renderInventoryPlaces(batches, selectedLocation, settings) {
  const locations = [...new Set([...(settings.defaultLocations || []), ...batches.map((batch) => batch.location)])];
  document.querySelector("#inventoryPlaces").innerHTML = [
    `<button class="place-chip ${selectedLocation === "all" ? "is-selected" : ""}" type="button" data-location="all"><span class="place-chip-icon">${locationIcon("all")}</span><span>Mind</span></button>`,
    ...locations.map((location) => {
      const [tone, icon] = locationAppearance(location);
      return `<button class="place-chip ${selectedLocation === location ? "is-selected" : ""}" type="button" data-location="${escapeHtml(location)}"><span class="place-chip-icon ${tone}">${icon}</span><span>${escapeHtml(location)}</span></button>`;
    })
  ].join("");
}

export function renderInventory({ batches, selectedLocation, sort, group, settings, search = "" }) {
  renderInventoryPlaces(batches, selectedLocation, settings);
  let visible = selectedLocation === "all" ? [...batches] : batches.filter((batch) => batch.location === selectedLocation);
  if (search) {
    const term = search.toLocaleLowerCase("hu-HU");
    visible = visible.filter((batch) => fullProductName(batch).toLocaleLowerCase("hu-HU").includes(term));
  }
  visible.sort(sort === "name"
    ? (a, b) => fullProductName(a).localeCompare(fullProductName(b), "hu-HU")
    : (a, b) => a.expiryDate.localeCompare(b.expiryDate));

  document.querySelector("#inventoryTitle").textContent = selectedLocation === "all" ? "Minden hely" : selectedLocation;
  document.querySelector("#inventorySubtitle").textContent = `${visible.length} aktív termék`;
  if (!visible.length) {
    document.querySelector("#inventoryList").innerHTML = emptyState(search ? "Nincs ilyen nevű termék." : "Ezen a helyen még nincs termék.", `<button type="button" data-open-add>Termék hozzáadása</button>`);
    return;
  }
  if (group === "none") {
    document.querySelector("#inventoryList").innerHTML = visible.map(productCard).join("");
    return;
  }
  const groups = visible.reduce((result, batch) => {
    const category = batch.template?.category || "Egyéb";
    const subcategory = batch.template?.subcategory || "Egyéb";
    const key = `${category}|${subcategory}`;
    const current = result.get(key) || { category, subcategory, items: [] };
    current.items.push(batch);
    result.set(key, current);
    return result;
  }, new Map());
  document.querySelector("#inventoryList").innerHTML = [...groups.values()].map((entry) => `
    <section class="inventory-group"><div class="category-heading"><strong>${escapeHtml(entry.category)}</strong><span>${escapeHtml(entry.subcategory)} · ${entry.items.length} tétel</span></div>${entry.items.map(productCard).join("")}</section>`).join("");
}

export function renderProductDetail(batch, settings) {
  const expiry = expiryState(batch.expiryDate);
  const template = batch.template || {};
  document.querySelector("#detailPath").textContent = `${batch.location} · ${template.category || "Egyéb"} · ${template.subcategory || "Egyéb"}`;
  document.querySelector("#detailIcon").textContent = productSymbol(batch);
  const brand = template.brand || batch.brandSnapshot || "";
  const brandElement = document.querySelector("#detailBrand");
  brandElement.textContent = brand;
  brandElement.hidden = !brand;
  document.querySelector("#detailName").textContent = productName(batch);
  const expiryElement = document.querySelector("#detailExpiry");
  expiryElement.className = `detail-expiry status-${expiry.status}`;
  expiryElement.textContent = expiry.label;
  document.querySelector("#detailTimeline").innerHTML = timelineMarkup(batch, "detail-hero-timeline");
  const values = [
    ["Mennyiség", formatQuantity(batch.quantityBase, batch.displayUnit)],
    ["Kiszerelés / egység", batch.displayUnit],
    ["Vásárlási érték", formatMoney(batch.totalPriceAtPurchase, settings.currency)],
    ["Lejárat", formatDate(batch.expiryDate)],
    ["Felvitel ideje", formatDate(batch.createdAt?.slice(0, 10))],
    ["Vásárlás ideje", formatDate(batch.purchaseDate)],
    ["Hely", batch.location],
    ["Vonalkód", template.barcode || "Nincs megadva"],
    ["Megjegyzés", batch.note || "Nincs megjegyzés"]
  ];
  document.querySelector("#productDetailFields").innerHTML = `<section class="detail-section"><h2>Részletes adatok</h2><dl class="detail-list">${values.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl></section>`;
}

export function sortShoppingItems(items, mode = "category") {
  return [...items].sort((a, b) => {
    const categoryResult = (a.category || "Egyéb").localeCompare(b.category || "Egyéb", "hu-HU", { sensitivity: "base" });
    const nameResult = a.name.localeCompare(b.name, "hu-HU", { sensitivity: "base" });
    return mode === "name" ? nameResult || categoryResult : categoryResult || nameResult;
  });
}

function shoppingRow(item, showCategory = false) {
  const note = ["Készletből hozzáadva", "Kézzel hozzáadva"].includes(item.note) ? "" : item.note?.trim() || "";
  const meta = [showCategory ? item.category || "Egyéb" : "", note].filter(Boolean).join(" · ");
  return `<div class="shopping-row-wrap">
    <label class="shopping-row">
      <input type="checkbox" data-shopping-toggle="${escapeHtml(item.id)}" ${item.status === "purchased" ? "checked" : ""}>
      <span class="shopping-check" aria-hidden="true"></span>
      <span class="shopping-copy"><strong>${escapeHtml(item.name)}</strong>${meta ? `<small>${escapeHtml(meta)}</small>` : ""}</span>
      <span>${escapeHtml(`${item.quantity} ${item.unit}`)}</span>
    </label>
    <span class="shopping-row-actions"><button type="button" data-shopping-edit="${escapeHtml(item.id)}" aria-label="Szerkesztés">✎</button><button type="button" data-shopping-delete="${escapeHtml(item.id)}" aria-label="Törlés">×</button></span>
  </div>`;
}

function shoppingCollection(items, sort) {
  const sorted = sortShoppingItems(items, sort);
  if (sort === "name") return sorted.map((item) => shoppingRow(item, true)).join("");
  const groups = sorted.reduce((result, item) => {
    const category = item.category || "Egyéb";
    const current = result.get(category) || [];
    current.push(item);
    result.set(category, current);
    return result;
  }, new Map());
  return [...groups.entries()].map(([category, entries]) => `<section class="shopping-category-group"><header><strong>${escapeHtml(category)}</strong><span>${entries.length} tétel</span></header><div class="shopping-category-items">${entries.map((item) => shoppingRow(item)).join("")}</div></section>`).join("");
}

export function renderShopping(shopping, sort = "category") {
  const active = shopping.filter((item) => item.status === "active");
  const completed = shopping.filter((item) => item.status === "purchased");
  document.querySelector("#shoppingCount").textContent = active.length;
  document.querySelector("#completedCount").textContent = completed.length;
  const list = document.querySelector("#shoppingList");
  list.classList.toggle("is-grouped", sort === "category" && active.length > 0);
  list.innerHTML = active.length ? shoppingCollection(active, sort) : emptyState("A bevásárlólista most üres.");
  const completedList = document.querySelector("#completedItems");
  completedList.classList.toggle("is-grouped", sort === "category" && completed.length > 0);
  completedList.innerHTML = completed.length ? shoppingCollection(completed, sort) : `<p class="muted-copy">Még nincs kipipált tétel.</p>`;
}

export function renderStatistics(stats, settings) {
  document.querySelector("#weeklyWasteValue").textContent = formatMoney(stats.weeklyDiscardedValue, settings.currency);
  document.querySelector("#weeklyChartSummary").textContent = formatMoney(stats.weeklyDiscardedValue, settings.currency);
  const chartValues = stats.weeklyDiscardedByDay || [];
  const chartMaximum = Math.max(1, ...chartValues.map((day) => day.value));
  document.querySelector("#weeklyWasteChart").innerHTML = chartValues.map((day) => {
    const height = day.value > 0 ? Math.max(10, Math.round((day.value / chartMaximum) * 112)) : 3;
    const valueLabel = day.value > 0 ? formatMoney(day.value, settings.currency) : "";
    return `<div class="bar-column ${day.isToday ? "current" : ""}"><span class="bar-value">${escapeHtml(valueLabel)}</span><div class="bar" style="--height:${height}px" title="${escapeHtml(`${day.label}: ${formatMoney(day.value, settings.currency)}`)}"></div><small>${escapeHtml(day.label)}</small></div>`;
  }).join("");
  const renderComparison = (comparison, cardId, textId, valuesId) => {
    const card = document.querySelector(cardId);
    const difference = comparison?.difference || 0;
    const absoluteDifference = Math.abs(difference);
    const percentage = comparison?.previous > 0 ? Math.round((absoluteDifference / comparison.previous) * 100) : null;
    card.classList.toggle("is-positive", difference < 0);
    card.classList.toggle("is-negative", difference > 0);
    card.classList.toggle("is-neutral", difference === 0);
    document.querySelector(textId).textContent = difference < 0
      ? `${formatMoney(absoluteDifference, settings.currency)}-tal kevesebb pazarlás${percentage !== null ? ` (${percentage}%)` : ""}`
      : difference > 0
        ? `${formatMoney(absoluteDifference, settings.currency)}-tal több pazarlás${percentage !== null ? ` (${percentage}%)` : ""}`
        : "Nincs változás";
    document.querySelector(valuesId).textContent = `Most ${formatMoney(comparison?.current || 0, settings.currency)} · előző azonos időszak ${formatMoney(comparison?.previous || 0, settings.currency)}`;
  };
  renderComparison(stats.weeklyComparison, "#weeklyComparisonCard", "#weeklyComparisonText", "#weeklyComparisonValues");
  renderComparison(stats.monthlyComparison, "#monthlyComparisonCard", "#monthlyComparisonText", "#monthlyComparisonValues");
  document.querySelector("#monthlyWasteValue").textContent = formatMoney(stats.monthlyDiscardedValue, settings.currency);
  document.querySelector("#monthlyWasteCount").textContent = stats.discardedEventCount;
  document.querySelector("#monthlyConsumedValue").textContent = `${stats.consumedThisMonth} alkalom`;
  document.querySelector("#discardedList").innerHTML = stats.monthlyDiscarded.length
    ? stats.monthlyDiscarded.map((item) => `<div class="waste-row"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(formatQuantity(item.quantityBase, item.unit))}</small></span><b>${escapeHtml(formatMoney(item.value, settings.currency))}</b></div>`).join("")
    : emptyState("Ebben a hónapban még nem rögzítettél kidobást.");
}
