import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertDedicatedMeasurementPhotos } from "./capture-outbox";

const photo = (bytes: string, name = "photo.png") => new File([bytes], name, { type: "image/png" });

describe("dedicated measurement photo preflight", () => {
  it("rejects identical bytes despite a different filename and identifies both fields", async () => {
    await expect(
      assertDedicatedMeasurementPhotos(
        [],
        [
          { label: "肩幅", file: photo("same", "one.png") },
          { label: "身幅", file: photo("same", "two.png") },
        ],
      ),
    ).rejects.toThrow("身幅の採寸写真が肩幅の採寸写真と同じです。");
  });
  it("rejects reuse of a selected listing photo", async () => {
    await expect(
      assertDedicatedMeasurementPhotos(
        [{ label: "正面", file: photo("same") }],
        [{ label: "肩幅", file: photo("same") }],
      ),
    ).rejects.toThrow("肩幅の採寸写真が掲載用の正面と同じです。");
  });
  it("accepts distinct bytes with the same filename and does not impose new listing rules", async () => {
    await expect(
      assertDedicatedMeasurementPhotos(
        [
          { label: "正面", file: photo("listing") },
          { label: "背面", file: photo("listing") },
        ],
        [
          { label: "肩幅", file: photo("one") },
          { label: "身幅", file: photo("two") },
        ],
      ),
    ).resolves.toBeUndefined();
  });
  it("leaves missing-file checks to the existing save validation", async () => {
    await expect(
      assertDedicatedMeasurementPhotos([], [{ label: "肩幅", file: undefined }]),
    ).resolves.toBeUndefined();
  });
  it("runs in both save paths before upload preparation or requests", () => {
    for (const [file, start] of [
      ["p0-workspace.tsx", "async function confirmCapture()"],
      ["mobile-capture-workspace.tsx", "async function save()"],
    ]) {
      const source = readFileSync(`apps/web/src/components/${file}`, "utf8");
      const body = source.slice(source.indexOf(start!));
      const validation = body.indexOf("await assertDedicatedMeasurementPhotos(");
      expect(validation).toBeGreaterThan(0);
      expect(validation).toBeLessThan(body.indexOf("await prepareCaptureUpload("));
      expect(validation).toBeLessThan(body.indexOf("await requestJson"));
    }
  });
});
