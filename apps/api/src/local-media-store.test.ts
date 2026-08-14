import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  inspectImage,
  LocalPrivateMediaStore,
  stripLocationMetadata,
} from "./local-media-store.js";

const roots: string[] = [];
const workspaceId = "11111111-1111-4111-8111-111111111111";

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(async (root) => {
      const resolved = join(tmpdir(), root.slice(tmpdir().length + 1));
      if (!resolved.startsWith(tmpdir())) throw new Error("Refusing to clean a non-temporary path");
      await rm(root, { recursive: true, force: true });
    }),
  );
});

describe("zero-cost local private media store", () => {
  it("keeps the original immutable and strips JPEG EXIF before display", async () => {
    const root = await mkdtemp(join(tmpdir(), "resale-media-test-"));
    roots.push(root);
    const store = new LocalPrivateMediaStore(root);
    const original = jpegWithGpsMetadata();
    const originalHash = sha256(original);
    const originalKey = `workspaces/${workspaceId}/location-originals/photo.jpg`;
    const displayKey = `workspaces/${workspaceId}/location-display/photo.jpg`;
    await store.saveOriginal(originalKey, original);
    const result = await store.createSanitizedDisplay(originalKey, displayKey, "image/jpeg");
    const originalAfter = await readFile(join(root, ...originalKey.split("/")));
    const display = await readFile(join(root, ...displayKey.split("/")));
    expect(sha256(originalAfter)).toBe(originalHash);
    expect(display.toString("utf8")).not.toContain("GPSLatitude");
    expect(result.sha256).toBe(sha256(display));
    expect(result.sizeBytes).toBeLessThan(original.length);
  });

  it("replays the same original but refuses different bytes and path traversal", async () => {
    const root = await mkdtemp(join(tmpdir(), "resale-media-test-"));
    roots.push(root);
    const store = new LocalPrivateMediaStore(root);
    const bytes = jpegWithGpsMetadata();
    const key = `workspaces/${workspaceId}/location-originals/photo.jpg`;
    await store.saveOriginal(key, bytes);
    await expect(store.saveOriginal(key, bytes)).resolves.toMatchObject({
      storageKey: key,
    });
    const changed = Buffer.concat([bytes, Buffer.from("changed")]);
    await expect(store.saveOriginal(key, changed)).rejects.toThrow(/different bytes/u);
    await expect(
      store.saveOriginal(`workspaces/${workspaceId}/location-originals/../escape.jpg`, bytes),
    ).rejects.toThrow(/invalid/u);
  });

  it("fails closed with zero display output for invalid image bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "resale-media-test-"));
    roots.push(root);
    const store = new LocalPrivateMediaStore(root);
    const invalid = Buffer.from("not-a-jpeg");
    const originalKey = `workspaces/${workspaceId}/location-originals/bad.jpg`;
    const displayKey = `workspaces/${workspaceId}/location-display/bad.jpg`;
    await store.saveOriginal(originalKey, invalid);
    await expect(
      store.createSanitizedDisplay(originalKey, displayKey, "image/jpeg"),
    ).rejects.toThrow(/Invalid JPEG/u);
    await expect(stat(join(root, ...displayKey.split("/")))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("stores product originals privately and removes only the matching new file", async () => {
    const root = await mkdtemp(join(tmpdir(), "resale-media-test-"));
    roots.push(root);
    const store = new LocalPrivateMediaStore(root);
    const bytes = jpegWithGpsMetadata();
    const key = `workspaces/${workspaceId}/originals/product.jpg`;
    const saved = await store.saveOriginal(key, bytes);
    expect(saved.created).toBe(true);
    await expect(store.removeOriginal(key, sha256(Buffer.from("another")))).rejects.toThrow(
      /another hash/u,
    );
    await store.removeOriginal(key, saved.sha256);
    await expect(stat(join(root, ...key.split("/")))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects PNG metadata without changing image chunks", () => {
    expect(() => stripLocationMetadata(Buffer.from("not-png"), "image/png")).toThrow(
      /Invalid PNG/u,
    );
  });

  it("derives MIME type and dimensions from server-received bytes", () => {
    expect(inspectImage(jpegWithGpsMetadata())).toEqual({
      mimeType: "image/jpeg",
      width: 2000,
      height: 1500,
    });
    expect(() => inspectImage(Buffer.from("claimed-image"))).toThrow(/JPEG and PNG/u);
  });
});

function jpegWithGpsMetadata(): Buffer {
  const exif = Buffer.from("Exif\0\0GPSLatitude=35.0;GPSLongitude=139.0", "utf8");
  const app1Length = Buffer.alloc(2);
  app1Length.writeUInt16BE(exif.length + 2);
  const dimensions = Buffer.from([
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0xdc, 0x07, 0xd0, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
  ]);
  const scan = Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), app1Length, exif, dimensions, scan]);
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
