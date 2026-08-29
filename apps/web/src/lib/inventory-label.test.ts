import { appendCodeCheckDigit } from "@resale/contracts";
import { describe, expect, it } from "vitest";

import { encodeCode128Bits } from "./code128";
import {
  buildInventoryBarcodePayload,
  parseInventoryBarcodePayload,
  parseInventoryLookup,
  shortInventoryNumber,
} from "./inventory-label";

describe("inventory label", () => {
  const first = appendCodeCheckDigit("INV-000001");
  const larger = appendCodeCheckDigit("INV-012345");

  it("shows a short number without truncating unique digits", () => {
    expect(shortInventoryNumber(first)).toBe("0001");
    expect(shortInventoryNumber(larger)).toBe("12345");
  });

  it("round-trips a versioned local barcode payload", () => {
    const payload = buildInventoryBarcodePayload(first, 3);
    expect(payload).toBe(`RESALE|${first}|V3`);
    expect(parseInventoryBarcodePayload(payload)).toEqual({
      inventoryNumber: first,
      labelVersion: 3,
    });
  });

  it("rejects altered, stale-shaped, and secret-bearing input", () => {
    expect(parseInventoryBarcodePayload("RESALE|INV-000001-0|V1")).toBeNull();
    expect(parseInventoryBarcodePayload(`RESALE|${first}|V0`)).toBeNull();
    expect(parseInventoryLookup("token=do-not-store")).toBeNull();
  });

  it("accepts a checked full number and a four-or-more digit short number", () => {
    expect(parseInventoryLookup(first)).toEqual({ kind: "full", inventoryNumber: first });
    expect(parseInventoryLookup("0001")).toEqual({ kind: "short", shortNumber: "1" });
    expect(parseInventoryLookup("12345")).toEqual({ kind: "short", shortNumber: "12345" });
    expect(parseInventoryLookup("123")).toBeNull();
  });

  it("creates a non-empty Code 128 module pattern locally", () => {
    const bits = encodeCode128Bits(buildInventoryBarcodePayload(first, 1));
    expect(bits.length).toBeGreaterThan(100);
    expect(bits).toMatch(/^[01]+$/u);
    expect(bits.startsWith("110100")).toBe(true);
  });
});
