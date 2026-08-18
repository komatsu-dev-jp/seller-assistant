import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("runtime database role contract", () => {
  const source = readFileSync(new URL("./db-security.ts", import.meta.url), "utf8");

  it("fails closed for superuser, BYPASSRLS or missing runtime membership", () => {
    expect(source).toContain("role.rolsuper");
    expect(source).toContain("role.rolbypassrls");
    expect(source).toContain("!role.has_runtime");
    expect(source).toContain("resale_app_runtime");
  });
});
