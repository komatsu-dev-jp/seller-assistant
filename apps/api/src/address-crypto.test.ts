import { describe, expect, it } from "vitest";

import { AesGcmAddressCipher } from "./address-crypto.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";

describe("zero-cost private shipping address encryption", () => {
  it("encrypts at rest and binds decryption to the workspace and order", () => {
    const cipher = new AesGcmAddressCipher("11".repeat(32));
    const address = "架空県テスト市1-2-3 架空宛名";
    const encrypted = cipher.encrypt(workspaceId, orderId, address);
    expect(encrypted.ciphertext.toString("utf8")).not.toContain("テスト市");
    expect(cipher.decrypt(workspaceId, orderId, encrypted)).toBe(address);
    expect(() =>
      cipher.decrypt("33333333-3333-4333-8333-333333333333", orderId, encrypted),
    ).toThrow();
  });

  it("rejects invalid keys and blank addresses", () => {
    expect(() => new AesGcmAddressCipher("short")).toThrow(/32 bytes/u);
    const cipher = new AesGcmAddressCipher(Buffer.alloc(32, 7).toString("base64"));
    expect(() => cipher.encrypt(workspaceId, orderId, " ")).toThrow(/1 to 2048/u);
  });
});
