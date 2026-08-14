const DATABASE_NAME = "resale-ops-offline-v1";
const STORE_NAME = "putaway-outbox";
const DATABASE_VERSION = 1;

const inventoryPattern = /^INV-[0-9]{6}$/u;
const locationPattern = /^[A-Z]{2,4}-[0-9]{3,6}-[0-9]$/u;
const allowedKeys = new Set([
  "schemaVersion",
  "idempotencyKey",
  "inventoryNumber",
  "locationCode",
  "occurredAt",
]);

export interface PendingPutawayOperation {
  schemaVersion: 1;
  idempotencyKey: string;
  inventoryNumber: string;
  locationCode: string;
  occurredAt: string;
}

export function validatePendingPutaway(value: unknown): value is PendingPutawayOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) return false;
  return (
    record.schemaVersion === 1 &&
    typeof record.idempotencyKey === "string" &&
    /^[0-9a-f-]{36}$/iu.test(record.idempotencyKey) &&
    typeof record.inventoryNumber === "string" &&
    inventoryPattern.test(record.inventoryNumber) &&
    typeof record.locationCode === "string" &&
    locationPattern.test(record.locationCode) &&
    typeof record.occurredAt === "string" &&
    !Number.isNaN(Date.parse(record.occurredAt))
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "idempotencyKey" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("端末内保存を開始できませんでした。"));
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("端末内保存を中止しました。"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("端末内保存に失敗しました。"));
  });
}

export async function queuePutaway(
  inventoryNumber: string,
  locationCode: string,
): Promise<PendingPutawayOperation> {
  const operation: PendingPutawayOperation = {
    schemaVersion: 1,
    idempotencyKey: crypto.randomUUID(),
    inventoryNumber,
    locationCode,
    occurredAt: new Date().toISOString(),
  };
  if (!validatePendingPutaway(operation)) throw new Error("保存内容が安全条件を満たしていません。");

  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).add(operation);
    await waitForTransaction(transaction);
    return operation;
  } finally {
    database.close();
  }
}

export async function clearOfflineBusinessData(): Promise<void> {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_BUSINESS_CACHE" });
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onblocked = () =>
      reject(new Error("別画面を閉じてから端末内データを消去してください。"));
    request.onerror = () =>
      reject(request.error ?? new Error("端末内データを消去できませんでした。"));
  });
}
