import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsDirectory = fileURLToPath(new URL("../migrations/", import.meta.url));

describe("checked-code helper restore safety", () => {
  it("redefines every helper with a fixed search path and schema-qualified calls", () => {
    const migrationName = readdirSync(migrationsDirectory)
      .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
      .sort()
      .find((name) => name === "0040_restore_safe_checked_code_helpers.sql");

    expect(migrationName).toBe("0040_restore_safe_checked_code_helpers.sql");

    const migrationSql = migrationName
      ? readFileSync(
          fileURLToPath(new URL(`../migrations/${migrationName}`, import.meta.url)),
          "utf8",
        )
      : "";

    for (const helper of [
      "app_code_check_digit",
      "app_append_code_check_digit",
      "app_has_valid_code_check_digit",
    ]) {
      expect(migrationSql).toContain(`create or replace function public.${helper}`);
    }

    expect(migrationSql.match(/set search_path = pg_catalog, public/gu)).toHaveLength(3);
    expect(migrationSql).toContain("public.app_code_check_digit(upper(btrim(base_code)))");
    expect(migrationSql).toContain("public.app_code_check_digit(left(code, length(code) - 2))");
  });
});
