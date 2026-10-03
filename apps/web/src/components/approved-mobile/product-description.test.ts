import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  createReviewState,
  readReviewState,
  writeReviewState,
  reviewStorageKey,
  readReviewPhotos,
  saveReviewPhoto,
  confirmReviewPhoto,
} from "./local-review-store";
import { sampleProductDetails, validateProductDetails } from "./review-product-details";
import {
  buildReviewDescription,
  descriptionProblems,
  isProductPreparationScreen,
} from "./product-description";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("one-product preparation", () => {
  it("adds product fields to legacy v1 data without changing saved work", () => {
    const s = createReviewState();
    delete s.details;
    s.location = "棚A";
    s.stored = true;
    s.inspection.fill("ok");
    s.inspectionComplete = true;
    s.measurements = ["44", "52", "70", "60.5"];
    s.measurementsComplete = true;
    const db = storage();
    db.setItem(reviewStorageKey, JSON.stringify(s));
    const result = readReviewState(db);
    expect(result.state).toEqual({ ...s, details: sampleProductDetails() });
    result.state.details!.brand = "変更した見本ブランド";
    writeReviewState(db, result.state, result.raw);
    expect(readReviewState(db).state.details?.brand).toBe("変更した見本ブランド");
    expect(readReviewState(db).state.measurementsComplete).toBe(true);
  });
  it("uses entered facts, leaves out blank/invalid measurements and never exposes storage location", () => {
    const s = createReviewState();
    s.details = {
      ...sampleProductDetails(),
      condition: "B-",
      design: "ストライプ",
      note: "補足の見本",
    };
    s.location = "公開しない保管場所";
    s.measurements = ["45.5", "", "NaN", "60"];
    s.inspection[0] = "issue";
    s.issue = { location: "左袖", kind: "小さな汚れ", note: "確認用メモ" };
    const text = buildReviewDescription(s);
    expect(text).toContain("操作確認用");
    expect(text).toContain("肩幅：45.5cm");
    expect(text).toContain("袖丈：60cm");
    expect(text).not.toContain("着丈：");
    expect(text).not.toContain("身幅：");
    expect(text).not.toContain(s.location);
    expect(text).not.toContain("REVIEW-0001");
    expect(text).toContain("状態：小さな汚れあり");
    expect(text).toContain("左袖 / 小さな汚れ / 確認用メモ");
    expect(descriptionProblems(s)).toEqual([
      "着丈は0より大きく300cm以下の数値で入力してください。",
    ]);
  });
  it("does not invent a condition or require photo-processing before copying", () => {
    const s = createReviewState();
    expect(descriptionProblems(s)).toEqual(["商品の状態を選んでください。"]);
    expect(buildReviewDescription(s)).not.toContain("状態：");
    s.details!.condition = "A";
    expect(descriptionProblems(s)).toEqual([]);
  });
  it("blocks corrupted details and stale writes without overwriting newer data", () => {
    expect(() => validateProductDetails({ ...sampleProductDetails(), condition: "bad" })).toThrow();
    expect(() =>
      validateProductDetails({ ...sampleProductDetails(), note: "a".repeat(1001) }),
    ).toThrow();
    const db = storage();
    const s = createReviewState();
    const original = writeReviewState(db, s, null);
    const newer = writeReviewState(
      db,
      { ...s, details: { ...s.details!, name: "新しい入力" } },
      original,
    );
    expect(() => writeReviewState(db, s, original)).toThrow("別の画面");
    expect(db.getItem(reviewStorageKey)).toBe(newer);
  });
  it("keeps confirmed originals and prevents another tab's draft from being overwritten", async () => {
    const db = new IDBFactory();
    const original = new Blob(["original"], { type: "image/png" });
    await saveReviewPhoto(db, "front", original);
    const token = (await readReviewPhotos(db))["draft:front"]!.token;
    await confirmReviewPhoto(db, "front", token);
    await saveReviewPhoto(db, "front", new Blob(["draft"], { type: "image/png" }), null);
    await expect(
      saveReviewPhoto(db, "front", new Blob(["stale"], { type: "image/png" }), null),
    ).rejects.toThrow("別の画面");
    const photos = await readReviewPhotos(db);
    expect(await photos.front!.blob.text()).toBe("original");
    expect(await photos["draft:front"]!.blob.text()).toBe("draft");
    await saveReviewPhoto(
      db,
      "front",
      new Blob(["new draft"], { type: "image/png" }),
      photos["draft:front"]!.token,
    );
    expect(await (await readReviewPhotos(db))["draft:front"]!.blob.text()).toBe("new draft");
  });
  it.each(["29", "30", "31", "photo-01", "photo-02", "photo-03", "photo-06", "photo-07"])(
    "connects old entry %s to preparation",
    (id) => {
      expect(isProductPreparationScreen(id)).toBe(true);
    },
  );
  it("leaves accounting and optional recipe settings outside this change", () => {
    for (const id of ["44", "photo-04", "photo-05", "32", "33"])
      expect(isProductPreparationScreen(id)).toBe(false);
  });
});
