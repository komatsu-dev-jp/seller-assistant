import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearCaptureBusinessData,
  clearUnassignedCaptureUploads,
  loadCaptureDraft,
  loadCaptureUploads,
  prepareCaptureUpload,
  saveCaptureDraft,
} from "./capture-outbox";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const skuOne = "22222222-2222-4222-8222-222222222222";
const skuTwo = "33333333-3333-4333-8333-333333333333";

describe("capture IndexedDB outbox", () => {
  beforeEach(async () => {
    await clearCaptureBusinessData();
  });

  it("stages real file bytes and reuses an asset only for the same SHA-256", async () => {
    const first = await prepareCaptureUpload(
      workspaceId,
      skuOne,
      "front",
      new File(["same-image-bytes"], "front-a.jpg", {
        type: "image/jpeg",
        lastModified: 1,
      }),
    );
    const sameBytesDifferentMetadata = await prepareCaptureUpload(
      workspaceId,
      skuOne,
      "front",
      new File(["same-image-bytes"], "front-b.jpg", {
        type: "image/jpeg",
        lastModified: 99,
      }),
    );
    const changedBytes = await prepareCaptureUpload(
      workspaceId,
      skuOne,
      "front",
      new File(["changed-image-bytes"], "front-b.jpg", {
        type: "image/jpeg",
        lastModified: 99,
      }),
    );

    expect(sameBytesDifferentMetadata.assetId).toBe(first.assetId);
    expect(changedBytes.assetId).not.toBe(first.assetId);
    expect(await loadCaptureUploads(workspaceId, skuOne)).toHaveLength(1);
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
      const request = indexedDB.open("resale-capture-outbox-v1", 3);
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
