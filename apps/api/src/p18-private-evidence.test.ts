import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { InMemoryWorkflowRepository, RepositoryError } from "./repository.js";
import type { P0ItemRepository } from "./p0-item-repository.js";
import type { PrivateMediaStore } from "./local-media-store.js";
import { uploadProductMediaQuerySchema, photoRoleSchema } from "@resale/contracts";
import { readFileSync } from "node:fs";

const workspaceId = "91111111-1111-4111-8111-111111111111";
const skuId = "92222222-2222-4222-8222-222222222222";
const assetId = "93333333-3333-4333-8333-333333333333";
const identityId = "94444444-4444-4444-8444-444444444444";
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function appFor(repository: Partial<P0ItemRepository>, mediaStore?: Partial<PrivateMediaStore>) {
  const app = buildApp({
    p0ItemRepository: { close: async () => {}, ...repository } as P0ItemRepository,
    authenticate: (headers) => (headers.authorization ? { identityId, workspaceId } : null),
    validateWriteOrigin: () => true,
    ...(mediaStore ? { mediaStore: mediaStore as PrivateMediaStore } : {}),
  });
  apps.push(app);
  return app;
}

describe("P18 private catalog and evidence boundaries", () => {
  it.each(["assignment", "membership"])(
    "does not return location-photo bytes after %s revocation during storage read",
    async (revocation) => {
      const repository = new InMemoryWorkflowRepository();
      let active = true;
      const access = vi
        .spyOn(repository, "approvedLocationPhotoContent")
        .mockImplementation(async () => {
          if (!active) throw new RepositoryError("forbidden", "Assignment revoked");
          return {
            displayStorageKey: "private/fake.jpg",
            displaySha256: "a".repeat(64),
            mimeType: "image/jpeg",
          };
        });
      const app = buildApp({
        repository,
        authenticate: () =>
          revocation === "membership" && !active ? null : { identityId, workspaceId },
        mediaStore: {
          readDisplay: async () => {
            active = false;
            return Buffer.from("private-location-photo");
          },
        } as unknown as PrivateMediaStore,
      });
      apps.push(app);
      const response = await app.inject({
        url: `/v1/workspaces/${workspaceId}/locations/${skuId}/photos/${assetId}/content`,
      });
      expect(response.statusCode).toBe(403);
      expect(response.body).not.toContain("private-location-photo");
      expect(access).toHaveBeenCalledTimes(revocation === "assignment" ? 2 : 1);
    },
  );
  it("requires dedicated definitions without expanding the listing-photo set", () => {
    expect(photoRoleSchema.safeParse("measurement_evidence").success).toBe(false);
    for (const role of ["front", "back", "brand_tag", "care_label"] as const) {
      expect(photoRoleSchema.safeParse(role).success).toBe(true);
      expect(uploadProductMediaQuerySchema.safeParse({ assetId, role }).success).toBe(true);
    }
    expect(
      uploadProductMediaQuerySchema.safeParse({ assetId, role: "measurement_evidence" }).success,
    ).toBe(false);
    expect(
      uploadProductMediaQuerySchema.safeParse({
        assetId,
        role: "front",
        measurementDefinitionId: "chest_width",
      }).success,
    ).toBe(false);
    expect(
      uploadProductMediaQuerySchema.safeParse({
        assetId,
        role: "measurement_evidence",
        measurementDefinitionId: "chest_width",
      }).success,
    ).toBe(true);
  });

  it("gives management all listing-photo roles without widening field-worker reads", () => {
    const source = readFileSync(new URL("./p0-item-repository.ts", import.meta.url), "utf8");
    const query = source.slice(
      source.indexOf("async productPhotoContent("),
      source.indexOf("async captureTasks("),
    );
    expect(query).toContain(
      "asset.role in ('front','back','brand_tag','care_label','measurement_evidence')",
    );
    expect(query).toMatch(
      /membership\.role = 'field_worker'\s+and asset\.role in \('front','measurement_evidence'\)/u,
    );
    expect(query).not.toMatch(
      /membership\.role = 'field_worker'\s+and asset\.role in \('front','back','brand_tag','care_label','measurement_evidence'\)/u,
    );
    expect(query).not.toContain("asset.role in ('front','back','brand_tag','care_label','flaw')");
  });

  it("authenticates return catalogs and strips unrelated financial/address fields", async () => {
    const catalog = vi.fn(async () => ({
      workspaceId,
      orders: [],
      loadedAt: new Date().toISOString(),
      address: "never return",
      cost: 123,
    }));
    const app = appFor({ returnCatalog: catalog });
    const path = `/v1/workspaces/${workspaceId}/inventory/return-catalog`;
    expect((await app.inject({ url: path })).statusCode).toBe(401);
    expect(catalog).not.toHaveBeenCalled();
    const result = await app.inject({ url: path, headers: { authorization: "test" } });
    expect(result.statusCode).toBe(200);
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect(result.body).not.toContain("never return");
    expect(result.json()).not.toHaveProperty("cost");
  });

  it("rejects catalog cross-workspace and role denials", async () => {
    const catalog = vi.fn(async () => {
      throw new RepositoryError("forbidden", "Management role required");
    });
    const app = appFor({ returnCatalog: catalog });
    expect(
      (
        await app.inject({
          url: `/v1/workspaces/${skuId}/inventory/return-catalog`,
          headers: { authorization: "test" },
        })
      ).statusCode,
    ).toBe(403);
    expect(catalog).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          url: `/v1/workspaces/${workspaceId}/inventory/return-catalog`,
          headers: { authorization: "test" },
        })
      ).statusCode,
    ).toBe(403);
  });

  it("rechecks photo access after loading sanitized bytes", async () => {
    const source = {
      storageKey: `workspaces/${workspaceId}/originals/${assetId}.jpg`,
      expectedSha256: "a".repeat(64),
      expectedMimeType: "image/jpeg" as const,
      expectedSizeBytes: 12,
      expectedWidth: 16,
      expectedHeight: 16,
    };
    let reads = 0;
    const app = appFor(
      {
        productPhotoContent: async () => {
          reads += 1;
          if (reads > 1) throw new RepositoryError("forbidden", "Assignment revoked");
          return source;
        },
      },
      { readSanitizedOriginal: async () => Buffer.from("private-photo") },
    );
    const result = await app.inject({
      url: `/v1/workspaces/${workspaceId}/skus/${skuId}/product-photos/${assetId}/content`,
      headers: { authorization: "test" },
    });
    expect(result.statusCode).toBe(403);
    expect(result.body).not.toContain("private-photo");
    expect(reads).toBe(2);
  });

  it("requires receipt human confirmation before saving any bytes", async () => {
    const save = vi.fn();
    const app = appFor({}, { saveOriginal: save });
    const result = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/receipt-evidence?assetId=${assetId}`,
      headers: { authorization: "test", "content-type": "image/jpeg" },
      payload: Buffer.from("not an image"),
    });
    expect(result.statusCode).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });

  it("does not expose a receipt if membership is revoked while loading", async () => {
    let reads = 0;
    const app = appFor(
      {
        receiptEvidenceContent: async () => {
          reads += 1;
          if (reads > 1) throw new RepositoryError("forbidden", "Membership revoked");
          return {
            storageKey: `workspaces/${workspaceId}/originals/receipt-${assetId}.jpg`,
            expectedSha256: "a".repeat(64),
            expectedMimeType: "image/jpeg",
            expectedSizeBytes: 12,
            expectedWidth: 16,
            expectedHeight: 16,
          };
        },
      },
      { readSanitizedOriginal: async () => Buffer.from("private-receipt") },
    );
    const result = await app.inject({
      url: `/v1/workspaces/${workspaceId}/receipt-evidence/${assetId}/content`,
      headers: { authorization: "test" },
    });
    expect(result.statusCode).toBe(403);
    expect(result.body).not.toContain("private-receipt");
  });
});

describe("dedicated measurement evidence", () => {
  async function fixture() {
    const repo = new InMemoryWorkflowRepository();
    const sku = await repo.createSku(
      workspaceId,
      { identityId },
      { skuCode: "MEASURE-TEST", title: "架空採寸商品", category: "トップス" },
    );
    const metadata = {
      assetId,
      role: "front" as const,
      originalSha256: "a".repeat(64),
      originalStorageKey: `workspaces/${workspaceId}/originals/${assetId}.jpg`,
      mimeType: "image/jpeg" as const,
      sizeBytes: 128,
      width: 16,
      height: 16,
    };
    const input = {
      definitionId: "chest_width",
      definitionVersion: 1,
      value: 52,
      unit: "cm" as const,
      basis: "flat_width" as const,
      state: "natural" as const,
      measuredAt: "2026-09-09T00:00:00.000Z",
      evidenceAssetId: assetId,
      attempt: 1,
      humanConfirmed: true as const,
    };
    return { repo, sku, metadata, input };
  }

  it("rejects front-photo reuse and dedicated hashes reused as listing photos", async () => {
    const { repo, sku, metadata, input } = await fixture();
    await repo.registerMediaAsset(workspaceId, sku.id, { identityId }, metadata);
    expect(() => repo.recordMeasurement(workspaceId, sku.id, { identityId }, input)).toThrow(
      "evidence",
    );
    expect(() =>
      repo.registerMediaAsset(
        workspaceId,
        sku.id,
        { identityId },
        {
          ...metadata,
          assetId: skuId,
          originalStorageKey: `workspaces/${workspaceId}/originals/${skuId}.jpg`,
          role: "measurement_evidence",
          measurementDefinitionId: "chest_width",
        },
      ),
    ).toThrow("reuse");
  });

  it("binds dedicated evidence to one definition and one current attempt", async () => {
    const { repo, sku, metadata, input } = await fixture();
    await repo.registerMediaAsset(
      workspaceId,
      sku.id,
      { identityId },
      { ...metadata, role: "measurement_evidence", measurementDefinitionId: "chest_width" },
    );
    expect(() =>
      repo.recordMeasurement(
        workspaceId,
        sku.id,
        { identityId },
        { ...input, definitionId: "body_length" },
      ),
    ).toThrow("evidence");
    expect(() =>
      repo.recordMeasurement(workspaceId, sku.id, { identityId }, { ...input, attempt: 2 }),
    ).toThrow("current version");
    const first = await repo.recordMeasurement(workspaceId, sku.id, { identityId }, input);
    expect(await repo.recordMeasurement(workspaceId, sku.id, { identityId }, input)).toEqual(first);
    expect(() =>
      repo.recordMeasurement(workspaceId, sku.id, { identityId }, { ...input, value: 53 }),
    ).toThrow("another payload");
    expect(() =>
      repo.recordMeasurement(workspaceId, sku.id, { identityId }, { ...input, attempt: 2 }),
    ).toThrow("unique");
    const summary = await repo.captureSummary(workspaceId, sku.id, { identityId });
    expect(summary.photoRoles).toEqual([]);
    expect(summary.requiredPhotoRolesComplete).toBe(false);
  });
});
