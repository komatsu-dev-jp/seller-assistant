import { describe, expect, it } from "vitest";
import {
  accountingHref,
  isPcLocalWorkScreen,
  pcAccountingScreen,
  reviewScreenHref,
  workflowHref,
} from "./review-workflow-routes";

describe("shared workflows stay on the selected platform", () => {
  it("keeps every PC workflow inside the Pages base path without double-prefixing", () => {
    for (const [kind, path] of [
      ["intake", "/pc/6/"],
      ["products", "/pc/products/"],
      ["preparation", "/pc/preparation/"],
      ["recipes", "/pc/recipes/"],
      ["work", "/pc/3/"],
    ] as const) {
      expect(workflowHref("pc", kind, "/seller-assistant")).toBe(`/seller-assistant${path}`);
      expect(workflowHref("pc", kind, "")).toBe(path);
    }
    expect(reviewScreenHref("pc", "14", "/seller-assistant")).toBe(
      "/seller-assistant/pc/workflow/?screen=14",
    );
    expect(reviewScreenHref("pc", "29", "/seller-assistant")).toBe(
      "/seller-assistant/pc/preparation/?panel=photos",
    );
    expect(reviewScreenHref("mobile", "14", "/seller-assistant")).toBe(
      "/seller-assistant/mobile/screens/14/",
    );
  });
  it("covers the full accounting sequence and guards arbitrary query values", () => {
    const stages = [
      "/pc/46/",
      "/pc/47/",
      "/pc/48/?stage=check",
      "/pc/48/?stage=file",
      "/pc/48/?stage=import",
      "/pc/48/?stage=history",
    ];
    for (const [index, id] of ["44", "45", "46", "47", "48", "49"].entries()) {
      expect(accountingHref("pc", id, "/seller-assistant")).toBe(
        `/seller-assistant${stages[index]}`,
      );
      expect(accountingHref("mobile", id, "")).toBe(`/mobile/screens/${id}/`);
    }
    expect(pcAccountingScreen("history")).toBe("49");
    expect(pcAccountingScreen("file")).toBe("47");
    expect(pcAccountingScreen("import")).toBe("48");
    for (const invalid of [null, "invalid", "__proto__", "constructor", "toString"])
      expect(pcAccountingScreen(invalid)).toBe("46");
    expect(accountingHref("pc", "05", "")).toBe("/pc/3/");
  });
  it("limits the PC sample work route to the existing local workflow", () => {
    for (const id of ["14", "19", "20", "28"]) expect(isPcLocalWorkScreen(id)).toBe(true);
    for (const id of [null, "04", "29", "00", "<script>"])
      expect(isPcLocalWorkScreen(id)).toBe(false);
    expect(reviewScreenHref("pc", "05", "")).toBe("/pc/3/");
    expect(reviewScreenHref("pc", "box-02", "")).toBe("/pc/6/");
    expect(reviewScreenHref("pc", "photo-03", "")).toBe("/pc/preparation/");
    expect(reviewScreenHref("pc", "unknown", "")).toBe("/pc/3/");
  });
});
