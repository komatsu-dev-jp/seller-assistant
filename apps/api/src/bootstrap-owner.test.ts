import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("initial owner bootstrap contract", () => {
  const source = readFileSync(new URL("./bootstrap-owner.ts", import.meta.url), "utf8");

  it("is local, interactive, serialized and one-time only", () => {
    expect(source).toContain("process.stdin.isTTY");
    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toContain("select count(*)::integer as count from auth_credential");
    expect(source).toContain("Initial owner already exists");
    expect(source).not.toMatch(/app\.(post|put|patch)|\/v1\/bootstrap/u);
  });

  it("does not print the password, email or database error", () => {
    expect(source).toContain('output.write(hidden ? "•" : character)');
    expect(source).toContain("入力値や秘密値は表示していません");
    expect(source).not.toMatch(
      /console\.|error\.message|output\.write\(password|JSON\.stringify\(input/u,
    );
  });
});
