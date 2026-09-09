export type CaptureRole = "front" | "back" | "brand_tag" | "care_label";
export type CaptureUploadRole = CaptureRole | "measurement_evidence" | "receipt_evidence";

export interface CaptureUploadRecord {
  key: string;
  workspaceId: string;
  skuId: string;
  role: CaptureUploadRole;
  /** 採寸の根拠写真だけに結び付ける定義ID。掲載写真には使わない。 */
  measurementDefinitionId: string | null;
  /** レシート選択中にだけ使う、商品作成の再送キー。 */
  purchaseIdempotencyKey: string | null;
  assetId: string;
  /** FileはIndexedDBへ保存しない。現在の画面を開いている間だけ保持する。 */
  file: File | null;
  uploaded: boolean;
  queuedAt: string;
}

export interface CaptureDraftRecord {
  key: string;
  workspaceId: string;
  skuId: string;
  measurements: Record<string, string>;
  measurementTemplateId: string | null;
  measurementTemplateVersion: number | null;
  reviewReasonCode: string;
  tagText: string;
  savedAt: string;
}

const DB_NAME = "resale-capture-outbox-v1";
const STORE_NAME = "capture_uploads";
const DRAFT_STORE_NAME = "capture_drafts";
const DATABASE_VERSION = 4;
const filesInCurrentPage = new Map<string, File>();
/** SHA-256は、画面を閉じるまで同じ画像かを確かめるためだけにメモリへ置く。 */
const fingerprintsInCurrentPage = new Map<string, string>();

export async function prepareCaptureUpload(
  workspaceId: string,
  skuId: string,
  role: CaptureRole,
  file: File,
): Promise<CaptureUploadRecord & { file: File }> {
  return prepareUpload(workspaceId, skuId, role, file, null);
}

export async function prepareMeasurementEvidenceUpload(
  workspaceId: string,
  skuId: string,
  measurementDefinitionId: string,
  file: File,
): Promise<CaptureUploadRecord & { file: File }> {
  if (!/^[a-z][a-z0-9_]{1,63}$/u.test(measurementDefinitionId)) {
    throw new Error("採寸項目を確認できません。画面を読み直してください。");
  }
  return prepareUpload(workspaceId, skuId, "measurement_evidence", file, measurementDefinitionId);
}

export async function prepareReceiptEvidenceUpload(
  workspaceId: string,
  file: File,
): Promise<CaptureUploadRecord & { file: File }> {
  const record = await prepareUpload(
    workspaceId,
    "purchase-receipt",
    "receipt_evidence",
    file,
    null,
  );
  if (record.purchaseIdempotencyKey) return record;
  const upgraded = { ...record, purchaseIdempotencyKey: crypto.randomUUID() };
  await putRecord(upgraded);
  return upgraded;
}

async function prepareUpload(
  workspaceId: string,
  skuId: string,
  role: CaptureUploadRole,
  file: File,
  measurementDefinitionId: string | null,
): Promise<CaptureUploadRecord & { file: File }> {
  assertSupportedImage(file);
  const key = `${workspaceId}:${skuId}:${role}${measurementDefinitionId ? `:${measurementDefinitionId}` : ""}`;
  const fingerprint = await fingerprintImage(file);
  const existing = await readRecord(key);
  // 画像バイトやハッシュは端末DBへ残さない。同じ画面で同じ画像を選んだ時だけ再送できる。
  if (existing && fingerprintsInCurrentPage.get(key) === fingerprint) {
    filesInCurrentPage.set(key, file);
    return { ...existing, file };
  }
  // 再読み込み後は既存の画像と同一だと確認できないため、新しい操作として扱う。
  const record: CaptureUploadRecord = {
    key,
    workspaceId,
    skuId,
    role,
    measurementDefinitionId,
    purchaseIdempotencyKey: role === "receipt_evidence" ? crypto.randomUUID() : null,
    assetId: crypto.randomUUID(),
    file,
    uploaded: false,
    queuedAt: new Date().toISOString(),
  };
  filesInCurrentPage.set(key, file);
  fingerprintsInCurrentPage.set(key, fingerprint);
  await putRecord(record);
  return { ...record, file };
}

async function fingerprintImage(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function assertSupportedImage(file: File): void {
  if (file.type !== "image/jpeg" && file.type !== "image/png") {
    throw new Error("写真はJPEGまたはPNGを選んでください。");
  }
  if (file.size <= 0) throw new Error("写真の内容を確認できません。");
  if (file.size > 25 * 1024 * 1024) throw new Error("写真は25MB以下を選んでください。");
}

export async function markCaptureUploaded(key: string): Promise<void> {
  const record = await readRecord(key);
  if (!record) return;
  await putRecord({ ...record, uploaded: true });
}

export async function clearCaptureUploads(workspaceId: string, skuId: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, DRAFT_STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const value = cursor.value as CaptureUploadRecord;
      if (value.workspaceId === workspaceId && value.skuId === skuId) {
        filesInCurrentPage.delete(value.key);
        fingerprintsInCurrentPage.delete(value.key);
        cursor.delete();
      }
      cursor.continue();
    };
    transaction.objectStore(DRAFT_STORE_NAME).delete(`${workspaceId}:${skuId}`);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("撮影保留を消去できません。"));
  });
  database.close();
}

export async function clearCaptureUpload(key: string): Promise<void> {
  filesInCurrentPage.delete(key);
  fingerprintsInCurrentPage.delete(key);
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("撮影保留を消去できません。"));
  });
  database.close();
}

export async function clearUnassignedCaptureUploads(
  workspaceId: string,
  allowedSkuIds: readonly string[],
): Promise<void> {
  const allowed = new Set(allowedSkuIds);
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, DRAFT_STORE_NAME], "readwrite");
    const request = transaction.objectStore(STORE_NAME).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const value = cursor.value as CaptureUploadRecord;
      if (
        value.workspaceId === workspaceId &&
        value.role !== "receipt_evidence" &&
        !allowed.has(value.skuId)
      ) {
        filesInCurrentPage.delete(value.key);
        fingerprintsInCurrentPage.delete(value.key);
        cursor.delete();
      }
      cursor.continue();
    };
    const draftRequest = transaction.objectStore(DRAFT_STORE_NAME).openCursor();
    draftRequest.onsuccess = () => {
      const cursor = draftRequest.result;
      if (!cursor) return;
      const value = cursor.value as CaptureDraftRecord;
      if (value.workspaceId === workspaceId && !allowed.has(value.skuId)) cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("解除済みの撮影途中データを消去できません。"));
  });
  database.close();
}

export async function saveCaptureDraft(
  workspaceId: string,
  skuId: string,
  value: Omit<CaptureDraftRecord, "key" | "workspaceId" | "skuId" | "savedAt">,
): Promise<void> {
  const record: CaptureDraftRecord = {
    key: `${workspaceId}:${skuId}`,
    workspaceId,
    skuId,
    ...value,
    savedAt: new Date().toISOString(),
  };
  if (!isCaptureDraftRecord(record)) throw new Error("撮影途中の入力値が安全条件を満たしません。");
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(DRAFT_STORE_NAME, "readwrite");
    transaction.objectStore(DRAFT_STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("採寸・タグの途中入力を保存できません。"));
  });
  database.close();
}

export async function loadCaptureDraft(
  workspaceId: string,
  skuId: string,
  expectedTemplate: { id: string; version: number } | null = null,
): Promise<CaptureDraftRecord | null> {
  const database = await openDatabase();
  const result = await new Promise<unknown>((resolve, reject) => {
    const request = database
      .transaction(DRAFT_STORE_NAME, "readonly")
      .objectStore(DRAFT_STORE_NAME)
      .get(`${workspaceId}:${skuId}`);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("採寸・タグの途中入力を読めません。"));
  });
  database.close();
  const normalized = normalizeCaptureDraft(result);
  if (!normalized) return null;
  if (
    expectedTemplate &&
    (normalized.measurementTemplateId !== expectedTemplate.id ||
      normalized.measurementTemplateVersion !== expectedTemplate.version)
  ) {
    return null;
  }
  if (!expectedTemplate && normalized.measurementTemplateId !== null) return null;
  return normalized;
}

function normalizeCaptureDraft(value: unknown): CaptureDraftRecord | null {
  if (isCaptureDraftRecord(value)) return value;
  if (!value || typeof value !== "object") return null;
  const legacy = value as Omit<
    CaptureDraftRecord,
    "measurementTemplateId" | "measurementTemplateVersion"
  >;
  const normalized = {
    ...legacy,
    measurementTemplateId: null,
    measurementTemplateVersion: null,
  };
  return isCaptureDraftRecord(normalized) ? normalized : null;
}

function isCaptureDraftRecord(value: unknown): value is CaptureDraftRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CaptureDraftRecord>;
  const measurements = record.measurements;
  if (!measurements || typeof measurements !== "object") return false;
  const safeNumber = (candidate: unknown) =>
    typeof candidate === "string" && /^(?:|[0-9]{1,3}(?:\.[0-9])?)$/u.test(candidate);
  const validMeasurements =
    Object.entries(measurements).length > 0 &&
    Object.entries(measurements).length <= 12 &&
    Object.entries(measurements).every(
      ([definitionId, measurement]) =>
        /^[a-z][a-z0-9_]{1,63}$/u.test(definitionId) && safeNumber(measurement),
    );
  const templateIsConsistent =
    (record.measurementTemplateId === null && record.measurementTemplateVersion === null) ||
    (typeof record.measurementTemplateId === "string" &&
      /^[a-z][a-z0-9_]{1,63}$/u.test(record.measurementTemplateId) &&
      Number.isInteger(record.measurementTemplateVersion) &&
      (record.measurementTemplateVersion ?? 0) > 0);
  return (
    typeof record.key === "string" &&
    typeof record.workspaceId === "string" &&
    typeof record.skuId === "string" &&
    validMeasurements &&
    templateIsConsistent &&
    typeof record.reviewReasonCode === "string" &&
    ["", "previous_entry_error", "garment_stretch", "measurement_definition_corrected"].includes(
      record.reviewReasonCode,
    ) &&
    typeof record.tagText === "string" &&
    record.tagText.length <= 4000 &&
    typeof record.savedAt === "string" &&
    !Number.isNaN(Date.parse(record.savedAt))
  );
}

export async function clearCaptureBusinessData(): Promise<void> {
  filesInCurrentPage.clear();
  fingerprintsInCurrentPage.clear();
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
        (request.result as CaptureUploadRecord[])
          .filter((record) => record.workspaceId === workspaceId && record.skuId === skuId)
          .map((record) => ({ ...record, file: filesInCurrentPage.get(record.key) ?? null })),
      );
    request.onerror = () => reject(request.error ?? new Error("撮影保留を読めません。"));
  });
  database.close();
  return records;
}

export async function loadReceiptEvidenceUpload(
  workspaceId: string,
): Promise<CaptureUploadRecord | null> {
  return readRecord(`${workspaceId}:purchase-receipt:receipt_evidence`);
}

async function readRecord(key: string): Promise<CaptureUploadRecord | null> {
  const database = await openDatabase();
  const result = await new Promise<CaptureUploadRecord | undefined>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as CaptureUploadRecord | undefined);
    request.onerror = () => reject(request.error ?? new Error("撮影保留を読めません。"));
  });
  database.close();
  return result ? { ...result, file: filesInCurrentPage.get(key) ?? null } : null;
}

async function putRecord(record: CaptureUploadRecord): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const persisted: Omit<CaptureUploadRecord, "file"> = {
      key: record.key,
      workspaceId: record.workspaceId,
      skuId: record.skuId,
      role: record.role,
      measurementDefinitionId: record.measurementDefinitionId,
      purchaseIdempotencyKey: record.purchaseIdempotencyKey,
      assetId: record.assetId,
      uploaded: record.uploaded,
      queuedAt: record.queuedAt,
    };
    transaction.objectStore(STORE_NAME).put(persisted);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("撮影保留を保存できません。"));
  });
  database.close();
}

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
      // v1〜v3はFile/Blobを含み得るため、アップグレード時に必ず消去する。
      if (request.transaction && event.oldVersion < 4) {
        request.transaction.objectStore(STORE_NAME).clear();
      }
      if (!request.result.objectStoreNames.contains(DRAFT_STORE_NAME)) {
        request.result.createObjectStore(DRAFT_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("端末内の撮影保留を開けません。"));
  });
}
