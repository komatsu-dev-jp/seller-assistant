import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import {
  createReviewState,
  readReviewState,
  writeReviewState,
  reviewStorageKey,
  validateReviewState,
  resumeReviewScreen,
  validMeasurement,
  readReviewPhotos,
  saveReviewPhoto,
  confirmReviewPhoto,
  resetReviewData,
  resetReviewDataAndReload,
} from "./local-review-store";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe("mobile local-only review persistence", () => {
  it("starts a single synthetic product without marking any work complete", () => {
    const result = readReviewState(memoryStorage());
    expect(result.state.product).toBe("REVIEW-0001");
    expect(resumeReviewScreen(result.state, {})).toBe("14");
  });
  it("restores values, rejects stale tabs, and never clears unrelated data", async () => {
    const storage = memoryStorage();
    storage.setItem("other-app", "keep");
    const state = createReviewState();
    state.location = "確認用の棚";
    const raw = writeReviewState(storage, state, null);
    expect(readReviewState(storage).state.location).toBe("確認用の棚");
    expect(() => writeReviewState(storage, state, null)).toThrow();
    expect(writeReviewState(storage, state, raw)).toBe(raw);
    await resetReviewData(storage, new IDBFactory());
    expect(storage.getItem(reviewStorageKey)).toBeNull();
    expect(storage.getItem("other-app")).toBe("keep");
  });
  it("blocks malformed and unknown data without overwriting it", () => {
    const storage = memoryStorage();
    for (const raw of [
      "{",
      '{"schema":2}',
      JSON.stringify({ ...createReviewState(), inspection: [] }),
    ]) {
      storage.setItem(reviewStorageKey, raw);
      expect(() => readReviewState(storage)).toThrow();
      expect(storage.getItem(reviewStorageKey)).toBe(raw);
    }
  });
  it("does not report unavailable or quota-limited storage as successful", () => {
    expect(() =>
      readReviewState({
        getItem: () => {
          throw new Error("denied");
        },
      }),
    ).toThrow();
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
    expect(() => writeReviewState(storage, createReviewState(), null)).toThrow();
  });
  it("validates all six inspections and four measurements before completion", () => {
    const state = createReviewState();
    state.stored = true;
    expect(() => validateReviewState(state)).toThrow();
    state.location = "棚A";
    state.inspectionComplete = true;
    expect(() => validateReviewState(state)).toThrow();
    state.inspection = ["ok", "ok", "ok", "ok", "ok", "issue"];
    expect(() => validateReviewState(state)).toThrow();
    state.issue = { location: "左袖", kind: "汚れ", note: "小さな汚れ" };
    expect(validateReviewState(state)).toEqual(state);
    state.measurementsComplete = true;
    expect(() => validateReviewState(state)).toThrow();
    state.measurements = ["47.5", "52", "70", "60"];
    expect(validateReviewState(state)).toEqual(state);
    for (const value of ["", "0", "-1", "abc", "Infinity", "1e3", "  "]) {
      expect(validMeasurement(value)).toBe(false);
    }
  });
  it("keeps a replacement draft separate until the person confirms it", async () => {
    const factory = new IDBFactory();
    const first = new Blob(["image one"], { type: "image/png" });
    const second = new Blob(["image two"], { type: "image/jpeg" });
    await saveReviewPhoto(factory, "front", first);
    expect((await readReviewPhotos(factory)).front).toBeUndefined();
    await confirmReviewPhoto(
      factory,
      "front",
      (await readReviewPhotos(factory))["draft:front"]!.token,
    );
    await saveReviewPhoto(factory, "front", second);
    let photos = await readReviewPhotos(factory);
    expect(await photos.front?.blob.text()).toBe("image one");
    expect(await photos["draft:front"]?.blob.text()).toBe("image two");
    await confirmReviewPhoto(factory, "front", photos["draft:front"]!.token);
    photos = await readReviewPhotos(factory);
    expect(await photos.front?.blob.text()).toBe("image two");
    expect(photos["draft:front"]).toBeUndefined();
    await expect(confirmReviewPhoto(factory, "back", "missing")).rejects.toThrow();
  });
  it("rejects unsupported, empty, and oversized photos", async () => {
    const factory = new IDBFactory();
    for (const blob of [
      new Blob([], { type: "image/png" }),
      new Blob(["svg"], { type: "image/svg+xml" }),
      new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "image/png" }),
    ]) {
      await expect(saveReviewPhoto(factory, "front", blob)).rejects.toThrow();
    }
    expect(await readReviewPhotos(factory)).toEqual({});
  });
  it("resumes the first unfinished stage instead of trusting the URL", () => {
    const state = createReviewState();
    state.location = "棚A";
    state.stored = true;
    expect(resumeReviewScreen(state, {})).toBe("17");
    state.inspection.fill("ok");
    state.inspectionComplete = true;
    expect(resumeReviewScreen(state, {})).toBe("20");
  });
  it("rejects a photo transaction that aborts for lack of space", async () => {
    const factory = new IDBFactory();
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    try {
      await expect(
        saveReviewPhoto(factory, "front", new Blob(["photo"], { type: "image/png" })),
      ).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
    expect(await readReviewPhotos(factory)).toEqual({});
  });
  it("does not erase text if clearing the photo store fails", async () => {
    const storage = memoryStorage();
    const raw = writeReviewState(storage, createReviewState(), null);
    const spy = vi.spyOn(IDBObjectStore.prototype, "clear").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    try {
      await expect(resetReviewData(storage, new IDBFactory())).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
    expect(storage.getItem(reviewStorageKey)).toBe(raw);
  });
  it("requires all eight confirmed slots before measurement, not draft photos", async () => {
    const factory = new IDBFactory();
    const state = createReviewState();
    state.location = "棚A";
    state.stored = true;
    state.inspection.fill("ok");
    state.inspectionComplete = true;
    for (const slot of ["front", "back", "brand", "quality", "collar", "cuff", "hem", "issue"]) {
      await saveReviewPhoto(factory, slot, new Blob([slot], { type: "image/png" }));
    }
    expect(resumeReviewScreen(state, await readReviewPhotos(factory))).toBe("20");
    for (const slot of ["front", "back", "brand", "quality", "collar", "cuff", "hem", "issue"]) {
      await confirmReviewPhoto(
        factory,
        slot,
        (await readReviewPhotos(factory))[`draft:${slot}`]!.token,
      );
    }
    expect(resumeReviewScreen(state, await readReviewPhotos(factory))).toBe("25");
    state.measurements = ["40", "50", "70", "60"];
    state.measurementsComplete = true;
    expect(resumeReviewScreen(state, await readReviewPhotos(factory))).toBe("04");
    await resetReviewData(memoryStorage(), factory);
    expect(await readReviewPhotos(factory)).toEqual({});
  });
  it("does not confirm a different tab's unseen replacement or overwrite the confirmed photo", async () => {
    const factory = new IDBFactory();
    const photo = (text: string) => new Blob([text], { type: "image/png" });
    await saveReviewPhoto(factory, "front", photo("original"));
    await confirmReviewPhoto(
      factory,
      "front",
      (await readReviewPhotos(factory))["draft:front"]!.token,
    );
    await saveReviewPhoto(factory, "front", photo("tab A"));
    const shownInTabA = (await readReviewPhotos(factory))["draft:front"]!;
    await saveReviewPhoto(factory, "front", photo("tab B"));
    await expect(confirmReviewPhoto(factory, "front", shownInTabA.token)).rejects.toThrow(
      "別画面で写真が変わりました",
    );
    const current = await readReviewPhotos(factory);
    expect(await current.front!.blob.text()).toBe("original");
    expect(await current["draft:front"]!.blob.text()).toBe("tab B");
    expect(current["draft:front"]!.token).not.toBe(shownInTabA.token);
    await confirmReviewPhoto(factory, "front", current["draft:front"]!.token);
    expect(await (await readReviewPhotos(factory)).front!.blob.text()).toBe("tab B");
  });
  it("refreshes both stores after a partial reset and allows retry without stale photos", async () => {
    const factory = new IDBFactory();
    const storage = memoryStorage();
    const state = createReviewState();
    state.location = "残る入力";
    writeReviewState(storage, state, null);
    storage.setItem("other-app", "keep");
    await saveReviewPhoto(factory, "front", new Blob(["photo"], { type: "image/png" }));
    await confirmReviewPhoto(
      factory,
      "front",
      (await readReviewPhotos(factory))["draft:front"]!.token,
    );
    const removeItem = storage.removeItem;
    storage.removeItem = () => {
      throw new DOMException("denied", "SecurityError");
    };
    const partial = await resetReviewDataAndReload(storage, factory);
    expect(partial.error).toContain("写真は消去しましたが、入力内容は消去できませんでした");
    expect(partial.photos).toEqual({});
    expect(partial.state?.location).toBe("残る入力");
    storage.removeItem = removeItem;
    const retried = await resetReviewDataAndReload(storage, factory);
    expect(retried.error).toBeNull();
    expect(retried.photos).toEqual({});
    expect(retried.state).toEqual(createReviewState());
    expect(storage.getItem("other-app")).toBe("keep");
  });
});
