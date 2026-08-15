export type CaptureRole = "front" | "back" | "brand_tag" | "care_label";

export interface CaptureUploadRecord {
  key: string;
  workspaceId: string;
  skuId: string;
  role: CaptureRole;
  assetId: string;
  file: File;
  uploaded: boolean;
  queuedAt: string;
}

const DB_NAME = "resale-capture-outbox-v1";
const STORE_NAME = "capture_uploads";

export async function prepareCaptureUpload(
  workspaceId: string,
  skuId: string,
  role: CaptureRole,
  file: File,
): Promise<CaptureUploadRecord> {
  const key = `${workspaceId}:${skuId}:${role}`;
  const existing = await readRecord(key);
  if (
    existing &&
    existing.file.name === file.name &&
    existing.file.size === file.size &&
    existing.file.lastModified === file.lastModified
  )
    return existing;
  const record: CaptureUploadRecord = {
    key,
    workspaceId,
    skuId,
    role,
    assetId: crypto.randomUUID(),
    file,
    uploaded: false,
    queuedAt: new Date().toISOString(),
  };
  await putRecord(record);
  return record;
}

export async function markCaptureUploaded(key: string): Promise<void> {
  const record = await readRecord(key);
  if (!record) return;
  await putRecord({ ...record, uploaded: true });
}

export async function clearCaptureUploads(workspaceId: string, skuId: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const value = cursor.value as CaptureUploadRecord;
      if (value.workspaceId === workspaceId && value.skuId === skuId) cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("撮影保留を消去できません。"));
  });
  database.close();
}

export async function clearCaptureBusinessData(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onblocked = () =>
      reject(new Error("別画面を閉じてから撮影途中データを消去してください。"));
    request.onerror = () =>
      reject(request.error ?? new Error("撮影途中データを消去できませんでした。"));
  });
}

export async function loadCaptureUploads(
  workspaceId: string,
  skuId: string,
): Promise<CaptureUploadRecord[]> {
  const database = await openDatabase();
  const records = await new Promise<CaptureUploadRecord[]>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () =>
      resolve(
        (request.result as CaptureUploadRecord[]).filter(
          (record) => record.workspaceId === workspaceId && record.skuId === skuId,
        ),
      );
    request.onerror = () => reject(request.error ?? new Error("撮影保留を読めません。"));
  });
  database.close();
  return records;
}

async function readRecord(key: string): Promise<CaptureUploadRecord | null> {
  const database = await openDatabase();
  const result = await new Promise<CaptureUploadRecord | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as CaptureUploadRecord | undefined);
    request.onerror = () => reject(request.error ?? new Error("撮影保留を読めません。"));
  });
  database.close();
  return result ?? null;
}

async function putRecord(record: CaptureUploadRecord): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("撮影保留を保存できません。"));
  });
  database.close();
}

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("端末内の撮影保留を開けません。"));
  });
}
