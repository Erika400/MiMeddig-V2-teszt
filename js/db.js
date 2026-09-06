const DATABASE_NAME = "mimeddig-v2";
const DATABASE_VERSION = 2;

const STORES = Object.freeze({
  templates: "templates",
  batches: "batches",
  events: "events",
  shopping: "shopping",
  settings: "settings"
});

let databasePromise;

function ensureStore(database, transaction, name, keyPath, indexes = []) {
  const store = database.objectStoreNames.contains(name)
    ? transaction.objectStore(name)
    : database.createObjectStore(name, { keyPath });
  indexes.forEach(([indexName, field]) => {
    if (!store.indexNames.contains(indexName)) store.createIndex(indexName, field, { unique: false });
  });
}

function createSchema(database, transaction) {
  ensureStore(database, transaction, STORES.templates, "id", [["nameKey", "nameKey"], ["barcode", "barcode"], ["updatedAt", "updatedAt"]]);
  ensureStore(database, transaction, STORES.batches, "id", [["templateId", "templateId"], ["location", "location"], ["expiryDate", "expiryDate"], ["status", "status"], ["updatedAt", "updatedAt"]]);
  ensureStore(database, transaction, STORES.events, "id", [["batchId", "batchId"], ["type", "type"], ["occurredAt", "occurredAt"]]);
  ensureStore(database, transaction, STORES.shopping, "id", [["status", "status"], ["createdAt", "createdAt"]]);
  ensureStore(database, transaction, STORES.settings, "key");
}

export function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("Ez a böngésző nem támogatja a helyi adatbázist."));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        createSchema(database, request.transaction);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("A helyi adatbázis nem nyitható meg."));
      request.onblocked = () => reject(new Error("Az adatbázis frissítését egy másik megnyitott lap blokkolja."));
    });
  }
  return databasePromise;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Sikertelen adatbázis-művelet."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("Az adatbázis-művelet megszakadt."));
    transaction.onerror = () => reject(transaction.error || new Error("Az adatbázis-művelet sikertelen."));
  });
}

export async function getAll(storeName) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  return requestResult(transaction.objectStore(storeName).getAll());
}

export async function getOne(storeName, key) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  return requestResult(transaction.objectStore(storeName).get(key));
}

export async function putOne(storeName, value) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
  return value;
}

export async function deleteOne(storeName, key) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(key);
  await transactionDone(transaction);
}

export async function runTransaction(storeNames, callback) {
  const database = await openDatabase();
  const transaction = database.transaction(storeNames, "readwrite");
  const stores = Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)]));
  const result = await callback(stores, requestResult);
  await transactionDone(transaction);
  return result;
}

export async function clearDatabaseData() {
  const database = await openDatabase();
  const transaction = database.transaction(Object.values(STORES), "readwrite");
  Object.values(STORES).forEach((store) => transaction.objectStore(store).clear());
  await transactionDone(transaction);
}

export { DATABASE_NAME, DATABASE_VERSION, STORES };
