import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { basename } from "node:path";

export interface DatabaseTarget {
  connectionUrl: string;
  database: string;
  host: string;
  password: string;
  port: string;
  user: string;
}

const safeDatabaseName = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,62}$/u;

export function readDatabaseTarget(name: string, rawValue: string | undefined): DatabaseTarget {
  assert.ok(rawValue, `${name} is required`);
  const parsed = new URL(rawValue);
  assert.ok(
    parsed.protocol === "postgres:" || parsed.protocol === "postgresql:",
    `${name} must use postgres:// or postgresql://`,
  );
  const normalizedHost = parsed.hostname.replace(/^\[(.*)\]$/u, "$1").toLowerCase();
  assert.ok(
    normalizedHost === "127.0.0.1" || normalizedHost === "::1",
    `${name} must use a numeric loopback-only host`,
  );
  assert.equal(parsed.search, "", `${name} must not include connection query parameters`);
  assert.equal(parsed.hash, "", `${name} must not include a URL fragment`);

  const database = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  const user = decodeURIComponent(parsed.username);
  assert.match(database, safeDatabaseName, `${name} must name one safe database identifier`);
  assert.match(user, safeDatabaseName, `${name} must include one safe database user identifier`);

  const port = parsed.port || "5432";
  const numericPort = Number(port);
  assert.ok(
    Number.isInteger(numericPort) && numericPort >= 1 && numericPort <= 65_535,
    `${name} must include a valid TCP port`,
  );

  return {
    connectionUrl: rawValue,
    database,
    host: normalizedHost,
    password: decodeURIComponent(parsed.password),
    port,
    user,
  };
}

export function databaseArguments(targetDatabase: DatabaseTarget): string[] {
  return [
    "--host",
    targetDatabase.host,
    "--port",
    targetDatabase.port,
    "--username",
    targetDatabase.user,
    "--dbname",
    targetDatabase.database,
    "--no-password",
  ];
}

export function buildPostgresToolEnvironment(
  parentEnvironment: NodeJS.ProcessEnv,
  password: string,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(parentEnvironment)) {
    if (!/^PG/iu.test(name) && value !== undefined) environment[name] = value;
  }
  environment.PGPASSWORD = password;
  return environment;
}

export function postgresToolFailureMessage(executable: string, code: number | null): string {
  return `${basename(executable)} failed with exit code ${String(code)}; PostgreSQL stderr was withheld to protect row data`;
}

export function postgresToolStartFailureMessage(executable: string): string {
  return `${basename(executable)} could not be started`;
}

export async function runPostgresTool(
  executable: string,
  arguments_: string[],
  password: string,
  parentEnvironment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(executable, arguments_, {
      env: buildPostgresToolEnvironment(parentEnvironment, password),
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    child.stderr.resume();
    child.once("error", () => {
      rejectPromise(new Error(postgresToolStartFailureMessage(executable)));
    });
    child.once("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(postgresToolFailureMessage(executable, code)));
    });
  });
}
