import { describe, expect, it } from "vitest";

import { loginDestination } from "../lib/login-return";

describe("login return destination", () => {
  it("returns an owner or accounting user to the requested accounting stage", () => {
    const target = "/accounting?stage=export&format=generic_journal_v1";
    expect(loginDestination("owner", target)).toBe(target);
    expect(loginDestination("accounting", target)).toBe(target);
  });

  it("rejects external, protocol-relative, backslash, and role-mismatched destinations", () => {
    expect(loginDestination("owner", "https://example.com/accounting")).toBe("/");
    expect(loginDestination("owner", "//example.com/accounting")).toBe("/");
    expect(loginDestination("owner", "/\\example.com/accounting")).toBe("/");
    expect(loginDestination("owner", "/\nevil.example")).toBe("/");
    expect(loginDestination("accounting", "/\nevil.example/accounting")).toBe("/accounting");
    expect(loginDestination("owner", "/\r\n//evil.example/accounting")).toBe("/");
    expect(loginDestination("owner", "/.//evil.example/accounting")).toBe("/");
    expect(loginDestination("owner", "/x/..//evil.example/accounting")).toBe("/");
    expect(loginDestination("owner", "/%2e//evil.example/accounting")).toBe("/");
    expect(loginDestination("shipping", "/accounting?stage=export")).toBe("/shipping");
    expect(loginDestination("field_worker", "/accounting?stage=export")).toBe("/mobile");
  });
});
