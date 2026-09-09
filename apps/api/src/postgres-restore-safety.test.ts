import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  buildPostgresToolEnvironment,
  databaseArguments,
  postgresToolFailureMessage,
  readDatabaseTarget,
  runPostgresTool,
} from "./postgres-restore-safety.js";

describe("PostgreSQL restore connection safety", () => {
  it("builds explicit arguments from a numeric-loopback URL", () => {
    const target = readDatabaseTarget(
      "TEST_DATABASE_URL",
      "postgres://restore_user:secret@127.0.0.1:55444/restore_target",
    );

    expect(databaseArguments(target)).toEqual([
      "--host",
      "127.0.0.1",
      "--port",
      "55444",
      "--username",
      "restore_user",
      "--dbname",
      "restore_target",
      "--no-password",
    ]);
  });

  it.each([
    "postgres://restore_user:secret@localhost:55444/restore_target",
    "postgres://restore_user:secret@192.0.2.1:55444/restore_target",
    "postgres://restore_user:secret@127.0.0.1:55444/host%3D192.0.2.1",
    "postgres://restore_user:secret@127.0.0.1:55444/restore_target?host=192.0.2.1",
    "postgres://restore_user:secret@127.0.0.1:55444/restore_target#unsafe",
  ])("rejects a URL that can expand or redirect the connection: %s", (connectionUrl) => {
    expect(() => readDatabaseTarget("TEST_DATABASE_URL", connectionUrl)).toThrow();
  });

  it("removes every inherited PG setting before adding only the password", () => {
    const environment = buildPostgresToolEnvironment(
      {
        Path: "C:\\Windows\\System32",
        PGHOSTADDR: "192.0.2.10",
        pgservice: "external-service",
        PGPASSWORD: "old-secret",
        PGOPTIONS: "-c search_path=unsafe",
        SYSTEMROOT: "C:\\Windows",
      },
      "one-use-password",
    );

    expect(environment).toEqual({
      Path: "C:\\Windows\\System32",
      PGPASSWORD: "one-use-password",
      SYSTEMROOT: "C:\\Windows",
    });
  });

  it("does not include PostgreSQL stderr or row values in a failure message", () => {
    const secretRow = "private-row-value";
    const message = postgresToolFailureMessage("C:\\pgsql\\bin\\pg_restore.exe", 1);

    expect(message).toContain("pg_restore.exe failed with exit code 1");
    expect(message).not.toContain(secretRow);
  });

  it("starts a child process with inherited PG settings removed", async () => {
    const assertionScript = [
      "const safe =",
      "process.env.PGHOSTADDR === undefined &&",
      "process.env.PGSERVICE === undefined &&",
      "process.env.PGPASSWORD === 'one-use-password' &&",
      "process.env.RESTORE_SAFE_MARKER === 'retained';",
      "process.exit(safe ? 0 : 12);",
    ].join(" ");

    await expect(
      runPostgresTool(process.execPath, ["-e", assertionScript], "one-use-password", {
        ...process.env,
        PGHOSTADDR: "192.0.2.10",
        PGPASSWORD: "old-secret",
        PGSERVICE: "external-service",
        RESTORE_SAFE_MARKER: "retained",
      }),
    ).resolves.toBeUndefined();
  });

  it("drains but withholds a child process's raw stderr", async () => {
    const secretRow = "private-row-value";

    await expect(
      runPostgresTool(
        process.execPath,
        ["-e", `process.stderr.write(${JSON.stringify(secretRow)}); process.exit(9);`],
        "",
      ),
    ).rejects.toThrowError(
      /node(?:\.exe)? failed with exit code 9; PostgreSQL stderr was withheld/u,
    );

    try {
      await runPostgresTool(
        process.execPath,
        ["-e", `process.stderr.write(${JSON.stringify(secretRow)}); process.exit(9);`],
        "",
      );
    } catch (error) {
      expect(String(error)).not.toContain(secretRow);
    }
  });
});

describe("PostgreSQL private-media restore coverage", () => {
  it("backs up every P0 private-file reference, including location derivatives", async () => {
    const integrationSource = await readFile(
      new URL("./postgres-restore-integration.ts", import.meta.url),
      "utf8",
    );

    for (const expectedSource of [
      "media_asset.original",
      "receipt_media_asset.original",
      "location_photo.original",
      "location_photo.derivative",
      "discrepancy_evidence_media.original",
      "shipping_photo_asset.original",
    ]) {
      expect(integrationSource).toContain(expectedSource);
    }
    expect(integrationSource).toContain("privateMediaFiles=${targetMedia.length}");
    expect(integrationSource).toContain("assert.deepEqual(targetMedia, sourceMedia)");
    expect(integrationSource).toContain("verifyMediaFiles(targetMedia, targetMediaRoot)");
  });
});
