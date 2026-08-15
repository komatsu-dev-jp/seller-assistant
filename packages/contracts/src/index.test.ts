import { describe, expect, it } from "vitest";
import {
  appendCodeCheckDigit,
  checkedLocationCodeSchema,
  hasValidCodeCheckDigit,
  inventoryNumberSchema,
} from "./index.js";

describe("checked inventory and location codes", () => {
  it("generates stable human-readable check digits", () => {
    expect(appendCodeCheckDigit("INV-000123")).toBe("INV-000123-8");
    expect(appendCodeCheckDigit(" bx-014-3 ")).toBe("BX-014-3-2");
  });

  it("rejects a one-character mistype instead of accepting the wrong item or place", () => {
    expect(hasValidCodeCheckDigit("INV-000123-8")).toBe(true);
    expect(hasValidCodeCheckDigit("INV-000124-8")).toBe(false);
    expect(inventoryNumberSchema.safeParse("INV-000124-8").success).toBe(false);
    expect(checkedLocationCodeSchema.safeParse("BX-014-4-2").success).toBe(false);
  });
});
