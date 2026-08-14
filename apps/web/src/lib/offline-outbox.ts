const DATABASE_NAME = "resale-ops-offline-v1";
const STORE_NAME = "putaway-outbox";
const DATABASE_VERSION = 2;

const inventoryPattern = /^INV-[0-9]{6}$/u;
const locationPattern = /^[A-Z]{2,4}-[0-9]{3,6}-[0-9]$/u;
const allowedKeys = new Set([
  "schemaVersion",
  "idempotencyKey",
  "inventoryNumber",
  "locationCode",
  "inventoryLabelVersion",
  "locationLabelVersion",
  "inventoryScannedAt",
  "locationScannedAt",
  "confirmedAt",
  "humanConfirmed",
]);

export interface PendingPutawayOperation {
  schemaVersion: 2;
  idempotencyKey: string;
  inventoryNumber: string;
  locationCode: string;
  inventoryLabelVersion: number;
  locationLabelVersion: number;
  inventoryScannedAt: string;
  locationScannedAt: string;
  confirmedAt: string;
  humanConfirmed: true;
}

export function validatePendingPutaway(value: unknown): value is PendingPutawayOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) return false;
  return (
    record.schemaVersion === 2 &&
    typeof record.idempotencyKey === "string" &&
    /^[0-9a-f-]{36}$/iu.test(record.idempotencyKey) &&
    typeof record.inventoryNumber === "string" &&
    inventoryPattern.test(record.inventoryNumber) &&
    typeof record.locationCode === "string" &&
    locationPattern.test(record.locationCode) &&
    typeof record.inventoryLabelVersion === "number" &&
    Number.isSafeInteger(record.inventoryLabelVersion) &&
    record.inventoryLabelVersion > 0 &&
    typeof record.locationLabelVersion === "number" &&
    Number.isSafeInteger(record.locationLabelVersion) &&
    record.locationLabelVersion > 0 &&
    typeof record.inventoryScannedAt === "string" &&
    typeof record.locationScannedAt === "string" &&
    typeof record.confirmedAt === "string" &&
    !Number.isNaN(Date.parse(record.inventoryScannedAt)) &&
    !Number.isNaN(Date.parse(record.locationScannedAt)) &&
    !Number.isNaN(Date.parse(record.confirmedAt)) &&
    Date.parse(record.confirmedAt) >=
      Math.max(Date.parse(record.inventoryScannedAt), Date.parse(record.locationScannedAt)) &&
    record.humanConfirmed === true
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "idempotencyKey" });
      } else if (event.oldVersion < 2) {
        request.transaction?.objectStore(STORE_NAME).clear();
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

export function createPendingPutaway(
  inventoryNumber: string,
  locationCode: string,
  inventoryLabelVersion: number,
  locationLabelVersion: number,
  inventoryScannedAt: string,
  locationScannedAt: string,
): PendingPutawayOperation {
  const operation: PendingPutawayOperation = {
    schemaVersion: 2,
    idempotencyKey: crypto.randomUUID(),
    inventoryNumber,
    locationCode,
    inventoryLabelVersion,
    locationLabelVersion,
    inventoryScannedAt,
    locationScannedAt,
    confirmedAt: new Date().toISOString(),
    humanConfirmed: true,
  };
  if (!validatePendingPutaway(operation)) throw new Error("保存内容が安全条件を満たしていません。");
  return operation;
}

export async function queuePutaway(
  operation: PendingPutawayOperation,
): Promise<PendingPutawayOperation> {
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

export async function savePutawayOnlineFirst(
  operation: PendingPutawayOperation,
): Promise<"synced" | "queued"> {
  if (!validatePendingPutaway(operation)) throw new Error("保存内容が安全条件を満たしていません。");
  const result = await trySendPutaway(operation);
  if (result === "synced") return result;
  if (result === "forbidden") {
    throw new Error("担当が解除または変更されたため、この作業は保存しませんでした。");
  }
  return queueAfterUnavailable(operation);
}

export async function pendingPutawayCount(): Promise<number> {
  return (await readPendingPutaways()).length;
}

export async function syncPendingPutaways(): Promise<{
  synced: number;
  discarded: number;
  remaining: number;
}> {
  const pending = await readPendingPutaways();
  let synced = 0;
  let discarded = 0;
  for (const operation of pending) {
    const result = await trySendPutaway(operation);
    if (result === "unavailable") break;
    await deletePendingPutaway(operation.idempotencyKey);
    if (result === "synced") synced += 1;
    else discarded += 1;
  }
  return { synced, discarded, remaining: (await readPendingPutaways()).length };
}

async function trySendPutaway(
  operation: PendingPutawayOperation,
): Promise<"synced" | "unavailable" | "forbidden"> {
  try {
    const context = await fetch("/v1/session/context", { cache: "no-store" });
    if (context.status >= 500) return "unavailable";
    const contextBody = (await context.json().catch(() => null)) as {
      workspaceId?: string;
      message?: string;
    } | null;
    if (context.status === 401 || context.status === 403) return "forbidden";
    if (!context.ok || !contextBody?.workspaceId) {
      throw new Error(contextBody?.message ?? "ログイン中の事業所を確認できませんでした。");
    }
    const response = await fetch(
      `/v1/workspaces/${encodeURIComponent(contextBody.workspaceId)}/inventory/putaway`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toPutawayRequest(operation)),
        cache: "no-store",
      },
    );
    if (response.status === 201) return "synced";
    if (response.status === 401 || response.status === 403) return "forbidden";
    if (response.status >= 500) return "unavailable";
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "現在の在庫状態と一致しないため、再読取してください。");
  } catch (error) {
    if (error instanceof TypeError) return "unavailable";
    throw error;
  }
}

export function toPutawayRequest(operation: PendingPutawayOperation) {
  const { schemaVersion: _schemaVersion, ...request } = operation;
  void _schemaVersion;
  return request;
}

async function queueAfterUnavailable(operation: PendingPutawayOperation): Promise<"queued"> {
  await queuePutaway(operation);
  return "queued";
}

async function readPendingPutaways(): Promise<PendingPutawayOperation[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();
    const values = await new Promise<unknown[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () =>
        reject(request.error ?? new Error("同期待ちを読み取れませんでした。"));
    });
    await waitForTransaction(transaction);
    return values.filter(validatePendingPutaway);
  } finally {
    database.close();
  }
}

async function deletePendingPutaway(idempotencyKey: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(idempotencyKey);
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}

export async function clearOfflineBusinessData(): Promise<void> {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    await new Promise<void>((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(
        () => reject(new Error("端末キャッシュの消去確認が時間切れになりました。")),
        5_000,
      );
      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeout);
        const data: unknown = event.data;
        if (typeof data === "object" && data !== null && "cleared" in data && data.cleared === true)
          resolve();
        else reject(new Error("端末キャッシュの消去を確認できませんでした。"));
      };
      navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_BUSINESS_CACHE" }, [
        channel.port2,
      ]);
    });
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
