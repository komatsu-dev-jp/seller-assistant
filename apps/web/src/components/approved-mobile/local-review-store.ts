// Dedicated to the synthetic, browser-only Pages review. Never used by the live API app.
export const reviewStorageKey = "seller-assistant:mobile-review:v1";
const photoDatabase = "seller-assistant-mobile-review-photos-v1";
const photoStore = "photos";
export const inspectionLabels = ["全体", "襟元", "袖口", "裾", "ボタン・縫い目", "内側"] as const;
export const photoSlots = [
  ["front", "正面"],
  ["back", "背面"],
  ["brand", "ブランド・サイズ"],
  ["quality", "品質表示"],
  ["collar", "襟元"],
  ["cuff", "袖口"],
  ["hem", "裾"],
  ["issue", "気になる箇所"],
] as const;
export const measurementLabels = ["肩幅", "身幅", "着丈", "袖丈"] as const;
export type InspectionValue = "unchecked" | "ok" | "issue";
export type ReviewState = {
  schema: 1;
  product: "REVIEW-0001";
  location: string;
  stored: boolean;
  inspection: InspectionValue[];
  issue: { location: string; kind: string; note: string };
  inspectionComplete: boolean;
  selectedPhoto: number;
  measurements: string[];
  measurementsComplete: boolean;
};
export type ReviewPhoto = { token: string; blob: Blob };
export type ReviewPhotos = Record<string, ReviewPhoto>;
type ReadStorage = Pick<Storage, "getItem">;
type WriteStorage = Pick<Storage, "getItem" | "setItem">;

export function createReviewState(): ReviewState {
  return {
    schema: 1,
    product: "REVIEW-0001",
    location: "",
    stored: false,
    inspection: Array<InspectionValue>(6).fill("unchecked"),
    issue: { location: "", kind: "", note: "" },
    inspectionComplete: false,
    selectedPhoto: 0,
    measurements: ["", "", "", ""],
    measurementsComplete: false,
  };
}
export function validMeasurement(value: string): boolean {
  return /^\d{1,3}(\.\d{1,2})?$/u.test(value) && Number(value) > 0 && Number(value) <= 300;
}
function text(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.length <= max;
}
export function validateReviewState(value: unknown): ReviewState {
  if (!value || typeof value !== "object") throw new Error("保存データを読み取れません。");
  const s = value as ReviewState;
  if (s.schema !== 1)
    throw new Error("この保存データの版には対応していません。消去せず更新を確認してください。");
  if (
    s.product !== "REVIEW-0001" ||
    !text(s.location, 120) ||
    typeof s.stored !== "boolean" ||
    !Array.isArray(s.inspection) ||
    s.inspection.length !== 6 ||
    !s.inspection.every((v) => ["unchecked", "ok", "issue"].includes(v)) ||
    !s.issue ||
    !text(s.issue.location, 120) ||
    !text(s.issue.kind, 120) ||
    !text(s.issue.note) ||
    typeof s.inspectionComplete !== "boolean" ||
    !Number.isInteger(s.selectedPhoto) ||
    s.selectedPhoto < 0 ||
    s.selectedPhoto >= photoSlots.length ||
    !Array.isArray(s.measurements) ||
    s.measurements.length !== 4 ||
    !s.measurements.every((v) => text(v, 12)) ||
    typeof s.measurementsComplete !== "boolean" ||
    (s.stored && !s.location.trim()) ||
    (s.inspectionComplete &&
      (!s.stored ||
        s.inspection.includes("unchecked") ||
        (s.inspection.includes("issue") && (!s.issue.location.trim() || !s.issue.kind.trim())))) ||
    (s.measurementsComplete && (!s.inspectionComplete || !s.measurements.every(validMeasurement)))
  ) {
    throw new Error("保存データが壊れているため開けません。上書きせず停止しました。");
  }
  return s;
}
export function readReviewState(storage: ReadStorage): { state: ReviewState; raw: string | null } {
  const raw = storage.getItem(reviewStorageKey);
  return { state: raw === null ? createReviewState() : validateReviewState(JSON.parse(raw)), raw };
}
export function writeReviewState(
  storage: WriteStorage,
  state: ReviewState,
  expected: string | null,
): string {
  if (storage.getItem(reviewStorageKey) !== expected) {
    throw new Error(
      "別の画面で内容が変わりました。再読み込みして保存済みの内容を確認してください。",
    );
  }
  const raw = JSON.stringify(validateReviewState(state));
  storage.setItem(reviewStorageKey, raw);
  return raw;
}
export function resumeReviewScreen(state: ReviewState, photos: ReviewPhotos): string {
  if (!state.stored) return "14";
  if (!state.inspectionComplete) return "17";
  if (!photoSlots.every(([key]) => photos[key])) return "20";
  if (!state.measurementsComplete) return "25";
  return "04";
}
function validKey(key: string): boolean {
  const plain = key.replace(/^draft:/u, "");
  return photoSlots.some(([slot]) => slot === plain) || plain === "measurement";
}
export function validatePhoto(blob: Blob): void {
  if (
    !(blob instanceof Blob) ||
    !["image/jpeg", "image/png", "image/webp"].includes(blob.type) ||
    blob.size === 0 ||
    blob.size > 10 * 1024 * 1024
  ) {
    throw new Error(
      "写真は10MB以下のJPEG・PNG・WebPを選んでください。HEICはJPEGにしてからお試しください。",
    );
  }
}
function validatePhotoRecord(value: unknown): ReviewPhoto {
  const record = value as ReviewPhoto | undefined;
  if (!record || typeof record.token !== "string" || !/^[0-9a-f-]{36}$/u.test(record.token)) {
    throw new Error("写真の保存データの形式を確認できません。上書きせず停止しました。");
  }
  validatePhoto(record.blob);
  return record;
}
function openPhotos(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(photoDatabase, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(photoStore);
    request.onerror = () =>
      reject(new Error("写真の保存場所を開けません。端末の保存設定を確認してください。"));
    request.onblocked = () => reject(new Error("別の確認画面を閉じて再試行してください。"));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
async function photoTransaction<T>(
  factory: IDBFactory,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, result: (value: T) => void, fail: (error: Error) => void) => void,
): Promise<T> {
  const db = await openPhotos(factory);
  return new Promise<T>((resolve, reject) => {
    let value: T;
    let failure: Error | undefined;
    const tx = db.transaction(photoStore, mode);
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(
        failure ??
          new Error(
            "写真を保存・読込できませんでした。端末の空き容量と保存設定を確認して再試行してください。",
          ),
      );
    };
    try {
      action(
        tx.objectStore(photoStore),
        (result) => {
          value = result;
        },
        (error) => {
          failure = error;
          tx.abort();
        },
      );
    } catch (error) {
      failure = error instanceof Error ? error : new Error("写真を処理できませんでした。");
      tx.abort();
    }
  });
}
export function readReviewPhotos(factory: IDBFactory): Promise<ReviewPhotos> {
  return photoTransaction(factory, "readonly", (store, result, fail) => {
    const photos: ReviewPhotos = {};
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        result(photos);
        return;
      }
      try {
        const key = cursor.key;
        if (typeof key !== "string" || !validKey(key))
          throw new Error("写真の保存データが壊れています。上書きせず停止しました。");
        photos[key] = validatePhotoRecord(cursor.value);
        cursor.continue();
      } catch (error) {
        fail(error instanceof Error ? error : new Error("写真を読み取れません。"));
      }
    };
  });
}
export async function saveReviewPhoto(
  factory: IDBFactory,
  slot: string,
  blob: Blob,
): Promise<void> {
  if (!validKey(slot) || slot.startsWith("draft:")) throw new Error("写真の場所が不正です。");
  validatePhoto(blob);
  await photoTransaction<void>(factory, "readwrite", (store, result) => {
    store.put({ token: crypto.randomUUID(), blob }, `draft:${slot}`);
    result();
  });
}
export function confirmReviewPhoto(
  factory: IDBFactory,
  slot: string,
  expectedToken: string,
): Promise<void> {
  if (!validKey(slot) || slot.startsWith("draft:"))
    return Promise.reject(new Error("写真の場所が不正です。"));
  return photoTransaction<void>(factory, "readwrite", (store, result, fail) => {
    const request = store.get(`draft:${slot}`);
    request.onsuccess = () => {
      try {
        const record = validatePhotoRecord(request.result);
        if (record.token !== expectedToken) {
          fail(new Error("別画面で写真が変わりました。再読み込みして確認してください。"));
          return;
        }
        store.put(record, slot);
        store.delete(`draft:${slot}`);
        result();
      } catch {
        fail(new Error("確認する写真がありません。写真を選び直してください。"));
      }
    };
  });
}
export async function resetReviewData(
  storage: Pick<Storage, "removeItem">,
  factory: IDBFactory,
): Promise<void> {
  await photoTransaction<void>(factory, "readwrite", (store, result) => {
    store.clear();
    result();
  });
  try {
    storage.removeItem(reviewStorageKey);
  } catch {
    throw new Error(
      "写真は消去しましたが、入力内容は消去できませんでした。保存設定を確認し、確認用データの消去を再試行してください。",
    );
  }
}

// Both stores are read again even after a partial reset. Callers must replace stale UI state.
export async function resetReviewDataAndReload(
  storage: Pick<Storage, "getItem" | "removeItem">,
  factory: IDBFactory,
): Promise<{
  state: ReviewState | null;
  raw: string | null;
  photos: ReviewPhotos;
  error: string | null;
}> {
  let error: string | null = null;
  try {
    await resetReviewData(storage, factory);
  } catch (cause) {
    error =
      cause instanceof Error
        ? cause.message
        : "確認用データを消去できませんでした。再試行してください。";
  }
  let state: ReviewState | null = null;
  let raw: string | null = null;
  let photos: ReviewPhotos = {};
  try {
    const data = readReviewState(storage);
    state = data.state;
    raw = data.raw;
  } catch {
    error = `${error ?? ""} 入力内容の再確認ができません。再読み込みしてください。`;
  }
  try {
    photos = await readReviewPhotos(factory);
  } catch {
    state = null;
    error = `${error ?? ""} 写真の再確認ができません。再読み込みしてください。`;
  }
  return { state, raw, photos, error };
}
