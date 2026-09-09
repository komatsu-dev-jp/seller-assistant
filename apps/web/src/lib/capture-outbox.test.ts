import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearCaptureBusinessData,
  clearUnassignedCaptureUploads,
  loadCaptureDraft,
  loadCaptureUploads,
  markCaptureUploaded,
  prepareCaptureUpload,
  prepareMeasurementEvidenceUpload,
  prepareReceiptEvidenceUpload,
  saveCaptureDraft,
} from "./capture-outbox";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const skuOne = "22222222-2222-4222-8222-222222222222";
const skuTwo = "33333333-3333-4333-8333-333333333333";

describe("capture IndexedDB outbox", () => {
  beforeEach(async () => {
    await clearCaptureBusinessData();
  });

  it("reuses only same-page identical image bytes and makes changed bytes a fresh operation", async () => {
    const firstFile = new File(["same-image-bytes"], "front-a.jpg", {
      type: "image/jpeg",
      lastModified: 1,
    });
    const first = await prepareCaptureUpload(workspaceId, skuOne, "front", firstFile);
    expect(first.file).toBe(firstFile);
    expect((await loadCaptureUploads(workspaceId, skuOne))[0]?.file).toBe(firstFile);
    await markCaptureUploaded(first.key);
    const sameOperation = await prepareCaptureUpload(
      workspaceId,
      skuOne,
      "front",
      new File(["same-image-bytes"], "front-a.jpg", {
        type: "image/jpeg",
        lastModified: 1,
      }),
    );
    const changedOperation = await prepareCaptureUpload(
      workspaceId,
      skuOne,
      "front",
      new File(["changed-image-bytes"], "front-c.jpg", {
        type: "image/jpeg",
        lastModified: 99,
      }),
    );

    expect(sameOperation.assetId).toBe(first.assetId);
    expect(sameOperation.uploaded).toBe(true);
    expect(changedOperation.assetId).not.toBe(first.assetId);
    expect(changedOperation.uploaded).toBe(false);
  });

  it("makes a replacement receipt a new purchase operation", async () => {
    const first = await prepareReceiptEvidenceUpload(
      workspaceId,
      new File(["receipt-a"], "receipt-a.jpg", { type: "image/jpeg" }),
    );
    await markCaptureUploaded(first.key);
    const changed = await prepareReceiptEvidenceUpload(
      workspaceId,
      new File(["receipt-b"], "receipt-b.jpg", { type: "image/jpeg" }),
    );

    expect(changed.assetId).not.toBe(first.assetId);
    expect(changed.uploaded).toBe(false);
    expect(changed.purchaseIdempotencyKey).not.toBe(first.purchaseIdempotencyKey);
  });

  it("requires a reselect after reload and cannot assume the old image", async () => {
    const first = await prepareCaptureUpload(
      workspaceId,
      skuOne,
      "front",
      new File(["same-image-bytes"], "front-a.jpg", { type: "image/jpeg" }),
    );

    vi.resetModules();
    const afterReload = await import("./capture-outbox");
    expect((await afterReload.loadCaptureUploads(workspaceId, skuOne))[0]?.file).toBeNull();
    const reselected = await afterReload.prepareCaptureUpload(
      workspaceId,
      skuOne,
      "front",
      new File(["same-image-bytes"], "front-a.jpg", { type: "image/jpeg" }),
    );
    expect(reselected.assetId).not.toBe(first.assetId);
  });

  it("persists only operation metadata, purges legacy image bytes, and clears it on logout", async () => {
    const record = await prepareReceiptEvidenceUpload(
      workspaceId,
      new File(["receipt-body-must-not-persist"], "receipt.jpg", { type: "image/jpeg" }),
    );
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("resale-capture-outbox-v1", 4);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const raw = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = database
        .transaction("capture_uploads", "readonly")
        .objectStore("capture_uploads")
        .get(record.key);
      request.onsuccess = () => resolve(request.result as Record<string, unknown>);
      request.onerror = () => reject(request.error);
    });
    database.close();
    expect(raw).toMatchObject({ assetId: record.assetId, role: "receipt_evidence" });
    expect(raw).not.toHaveProperty("file");
    expect(raw).not.toHaveProperty("fileSha256");
    expect(Object.values(raw).some((value) => value instanceof File || value instanceof Blob)).toBe(
      false,
    );
    expect(Object.keys(raw).some((key) => /(?:file|blob|hash|image)/iu.test(key))).toBe(false);
    expect(JSON.stringify(raw)).not.toContain("receipt-body-must-not-persist");
    await clearCaptureBusinessData();
    expect(await loadCaptureUploads(workspaceId, "purchase-receipt")).toEqual([]);
  });

  it("purges a real v3 legacy File, Blob and hash during the v4 upgrade", async () => {
    const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("resale-capture-outbox-v1", 3);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("capture_uploads", { keyPath: "key" });
        request.result.createObjectStore("capture_drafts", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = legacy.transaction("capture_uploads", "readwrite");
      transaction.objectStore("capture_uploads").put({
        key: "legacy-image",
        workspaceId,
        skuId: skuOne,
        file: new File(["legacy-file"], "legacy.jpg", { type: "image/jpeg" }),
        blob: new Blob(["legacy-blob"], { type: "image/jpeg" }),
        fileSha256: "legacy-hash",
        receiptBody: "legacy-receipt-body",
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    const beforeUpgrade = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = legacy
        .transaction("capture_uploads", "readonly")
        .objectStore("capture_uploads")
        .get("legacy-image");
      request.onsuccess = () => resolve(request.result as Record<string, unknown>);
      request.onerror = () => reject(request.error);
    });
    expect(beforeUpgrade).toHaveProperty("file");
    expect(beforeUpgrade).toHaveProperty("blob");
    expect(beforeUpgrade).toHaveProperty("fileSha256", "legacy-hash");
    expect(JSON.stringify(beforeUpgrade)).toContain("legacy-receipt-body");
    legacy.close();

    const newRecord = await prepareCaptureUpload(
      workspaceId,
      skuOne,
      "front",
      new File(["new-file"], "new.jpg", { type: "image/jpeg" }),
    );
    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("resale-capture-outbox-v1", 4);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const all = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const request = upgraded
        .transaction("capture_uploads", "readonly")
        .objectStore("capture_uploads")
        .getAll();
      request.onsuccess = () => resolve(request.result as Record<string, unknown>[]);
      request.onerror = () => reject(request.error);
    });
    upgraded.close();

    expect(all.map((record) => record.key)).toEqual([newRecord.key]);
    expect(JSON.stringify(all)).not.toContain("legacy-");
  });

  it("separates each measurement proof and a purchase receipt from listing photos", async () => {
    const measurement = await prepareMeasurementEvidenceUpload(
      workspaceId,
      skuOne,
      "shoulder_width",
      new File(["measure"], "measure.jpg", { type: "image/jpeg" }),
    );
    const receipt = await prepareReceiptEvidenceUpload(
      workspaceId,
      new File(["receipt"], "receipt.png", { type: "image/png" }),
    );
    const uploads = await loadCaptureUploads(workspaceId, skuOne);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({
      role: "measurement_evidence",
      measurementDefinitionId: "shoulder_width",
    });
    expect(measurement.assetId).not.toBe(receipt.assetId);
    expect(receipt.purchaseIdempotencyKey).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[0-9a-f]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu,
    );
  });

  it("persists measurements, reason and tag text and clears only revoked SKUs", async () => {
    await saveCaptureDraft(workspaceId, skuOne, {
      measurements: {
        shoulder_width: "42",
        chest_width: "52.5",
        sleeve_length: "61",
        body_length: "70",
      },
      measurementTemplateId: null,
      measurementTemplateVersion: null,
      reviewReasonCode: "garment_stretch",
      tagText: "架空ブランド 型番ABC",
    });
    await saveCaptureDraft(workspaceId, skuTwo, {
      measurements: {
        shoulder_width: "40",
        chest_width: "50",
        sleeve_length: "60",
        body_length: "68",
      },
      measurementTemplateId: null,
      measurementTemplateVersion: null,
      reviewReasonCode: "",
      tagText: "",
    });

    expect((await loadCaptureDraft(workspaceId, skuOne))?.measurements.chest_width).toBe("52.5");
    await clearUnassignedCaptureUploads(workspaceId, [skuTwo]);
    expect(await loadCaptureDraft(workspaceId, skuOne)).toBeNull();
    expect(await loadCaptureDraft(workspaceId, skuTwo)).not.toBeNull();
  });

  it("keeps a dynamic pants profile, rejects unsafe keys and does not restore another template", async () => {
    await saveCaptureDraft(workspaceId, skuOne, {
      measurements: {
        waist_flat_width: "40",
        rise_length: "29",
        inseam_length: "72",
        thigh_width: "30",
        hem_width: "20",
      },
      measurementTemplateId: "pants_standard_v1",
      measurementTemplateVersion: 1,
      reviewReasonCode: "",
      tagText: "",
    });
    expect(
      (await loadCaptureDraft(workspaceId, skuOne, { id: "pants_standard_v1", version: 1 }))
        ?.measurements.hem_width,
    ).toBe("20");
    expect(
      await loadCaptureDraft(workspaceId, skuOne, { id: "tops_standard_v1", version: 1 }),
    ).toBeNull();

    await expect(
      saveCaptureDraft(workspaceId, skuTwo, {
        measurements: { "unsafe-key": "42" },
        measurementTemplateId: "tops_standard_v1",
        measurementTemplateVersion: 1,
        reviewReasonCode: "",
        tagText: "",
      }),
    ).rejects.toThrow("安全条件");
    await expect(
      saveCaptureDraft(workspaceId, skuTwo, {
        measurements: Object.fromEntries(
          Array.from({ length: 13 }, (_, index) => [`measure_${index}`, "1"]),
        ),
        measurementTemplateId: "tops_standard_v1",
        measurementTemplateVersion: 1,
        reviewReasonCode: "",
        tagText: "",
      }),
    ).rejects.toThrow("安全条件");
  });

  it("reads a valid v2 tops draft only for a legacy task", async () => {
    await saveCaptureDraft(workspaceId, skuOne, {
      measurements: { shoulder_width: "1" },
      measurementTemplateId: null,
      measurementTemplateVersion: null,
      reviewReasonCode: "",
      tagText: "",
    });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("resale-capture-outbox-v1", 4);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("capture_drafts", "readwrite");
      transaction.objectStore("capture_drafts").put({
        key: `${workspaceId}:${skuOne}`,
        workspaceId,
        skuId: skuOne,
        measurements: {
          shoulder_width: "42",
          chest_width: "52",
          sleeve_length: "61",
          body_length: "70",
        },
        reviewReasonCode: "",
        tagText: "旧形式",
        savedAt: new Date().toISOString(),
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();

    expect((await loadCaptureDraft(workspaceId, skuOne))?.measurements.chest_width).toBe("52");
    expect(
      await loadCaptureDraft(workspaceId, skuOne, { id: "tops_standard_v1", version: 1 }),
    ).toBeNull();
  });
});
