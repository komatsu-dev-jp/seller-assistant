import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const postgresMock = vi.hoisted(() => vi.fn());

vi.mock("postgres", () => ({ default: postgresMock }));

import { assertRestrictedDatabaseRole } from "./db-security.js";

function createSqlClient(result: unknown, failure?: Error) {
  const sql = vi.fn(async () => {
    if (failure) throw failure;
    return result;
  }) as ReturnType<typeof vi.fn> & { end: ReturnType<typeof vi.fn> };
  sql.end = vi.fn(async () => undefined);
  postgresMock.mockReturnValueOnce(sql);
  return sql;
}

describe("runtime database role contract", () => {
  const source = readFileSync(new URL("./db-security.ts", import.meta.url), "utf8");

  beforeEach(() => {
    postgresMock.mockReset();
  });

  it("fails closed for superuser, BYPASSRLS or missing runtime membership", () => {
    expect(source).toContain("role.rolsuper");
    expect(source).toContain("role.rolbypassrls");
    expect(source).toContain("!role.has_runtime");
    expect(source).toContain("resale_app_runtime");
  });

  it("accepts only a restricted runtime member and always closes the connection", async () => {
    const sql = createSqlClient([
      { rolname: "resale_app_login", rolsuper: false, rolbypassrls: false, has_runtime: true },
    ]);

    await expect(assertRestrictedDatabaseRole("postgres://local-test")).resolves.toBeUndefined();
    expect(sql.end).toHaveBeenCalledWith({ timeout: 5 });
  });

  it.each([
    ["missing role", []],
    ["superuser", [{ rolname: "unsafe", rolsuper: true, rolbypassrls: false, has_runtime: true }]],
    ["BYPASSRLS", [{ rolname: "unsafe", rolsuper: false, rolbypassrls: true, has_runtime: true }]],
    [
      "missing runtime membership",
      [{ rolname: "unsafe", rolsuper: false, rolbypassrls: false, has_runtime: false }],
    ],
  ])("rejects %s", async (_label, rows) => {
    const sql = createSqlClient(rows);

    await expect(assertRestrictedDatabaseRole("postgres://local-test")).rejects.toThrow(
      "restricted LOGIN role",
    );
    expect(sql.end).toHaveBeenCalledWith({ timeout: 5 });
  });

  it("closes the connection when the role query fails", async () => {
    const sql = createSqlClient([], new Error("database unavailable"));

    await expect(assertRestrictedDatabaseRole("postgres://local-test")).rejects.toThrow(
      "database unavailable",
    );
    expect(sql.end).toHaveBeenCalledWith({ timeout: 5 });
  });
});
