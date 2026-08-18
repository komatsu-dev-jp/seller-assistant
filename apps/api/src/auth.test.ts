import { describe, expect, it } from "vitest";
import { hashPassword, passwordSecurityProfile, verifyPassword } from "./auth.js";

describe("zero-cost password security", () => {
  it("uses the OWASP scrypt floor and a unique 16-byte salt", async () => {
    const first = await hashPassword("長い試験パスワード-1234");
    const second = await hashPassword("長い試験パスワード-1234");
    expect(passwordSecurityProfile).toMatchObject({
      algorithm: "scrypt-v1",
      n: 2 ** 17,
      r: 8,
      p: 1,
      saltBytes: 16,
    });
    expect(first.salt).not.toEqual(second.salt);
    expect(first.hash).not.toEqual(second.hash);
    await expect(verifyPassword("長い試験パスワード-1234", first)).resolves.toBe(true);
    await expect(verifyPassword("間違った試験パスワード", first)).resolves.toBe(false);
  });

  it("rejects downgraded stored parameters", async () => {
    const record = await hashPassword("長い試験パスワード-1234");
    await expect(
      verifyPassword("長い試験パスワード-1234", { ...record, n: 2 ** 14 }),
    ).rejects.toThrow("security floor");
  });
});
