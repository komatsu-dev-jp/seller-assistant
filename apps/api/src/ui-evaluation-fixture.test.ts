import { describe, expect, it } from "vitest";

import {
  assertMatchingUiEvaluationDatabases,
  parseUiEvaluationDatabaseUrl,
  safeUiEvaluationFailureMessage,
} from "./ui-evaluation-fixture.js";

describe("UI evaluation fixture safety gates", () => {
  it("accepts only a loopback database with the dedicated prefix", () => {
    expect(
      parseUiEvaluationDatabaseUrl(
        "postgres://runtime:fixture@127.0.0.1:55432/resale_ui_seed_a",
        "runtime",
      ),
    ).toMatchObject({
      hostname: "127.0.0.1",
      port: "55432",
      database: "resale_ui_seed_a",
    });

    expect(() =>
      parseUiEvaluationDatabaseUrl(
        "postgres://runtime:fixture@database.example.test:55432/resale_ui_seed_a",
        "runtime",
      ),
    ).toThrow(/loopback host/u);
    expect(() =>
      parseUiEvaluationDatabaseUrl(
        "postgres://runtime:fixture@127.0.0.1:55432/resale_seed_a",
        "runtime",
      ),
    ).toThrow(/resale_ui_/u);
  });

  it("requires admin and runtime URLs to target exactly one isolated database", () => {
    const admin = parseUiEvaluationDatabaseUrl(
      "postgres://admin:fixture@localhost:55432/resale_ui_seed_a",
      "admin",
    );
    const runtime = parseUiEvaluationDatabaseUrl(
      "postgres://runtime:fixture@localhost:55432/resale_ui_seed_a",
      "runtime",
    );
    expect(() => assertMatchingUiEvaluationDatabases(admin, runtime)).not.toThrow();

    const otherPort = parseUiEvaluationDatabaseUrl(
      "postgres://runtime:fixture@localhost:55433/resale_ui_seed_a",
      "runtime",
    );
    const otherDatabase = parseUiEvaluationDatabaseUrl(
      "postgres://runtime:fixture@localhost:55432/resale_ui_seed_b",
      "runtime",
    );
    expect(() => assertMatchingUiEvaluationDatabases(admin, otherPort)).toThrow(
      /same loopback UI evaluation database/u,
    );
    expect(() => assertMatchingUiEvaluationDatabases(admin, otherDatabase)).toThrow(
      /same loopback UI evaluation database/u,
    );
  });

  it("reports only fixed, non-secret failure categories", () => {
    const denied = Object.assign(new Error("Access denied: C:\\private\\fixture"), {
      code: "EACCES",
    });
    expect(safeUiEvaluationFailureMessage(denied)).toBe("media directory safety check failed");
    expect(
      safeUiEvaluationFailureMessage(
        new Error("The UI evaluation database must be completely empty"),
      ),
    ).toBe("evaluation database is not empty");
    expect(safeUiEvaluationFailureMessage(new Error("secret internal detail"))).toBe(
      "safety gate or seed operation rejected",
    );
  });
});
