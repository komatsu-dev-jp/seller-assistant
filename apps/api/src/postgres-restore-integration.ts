import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import postgres from "postgres";
import {
  databaseArguments,
  readDatabaseTarget,
  runPostgresTool,
} from "./postgres-restore-safety.js";

type DatabaseConnection = ReturnType<typeof postgres>;

interface MediaRecord {
  source: string;
  sha256: string;
  size_bytes: number | null;
  storage_key: string;
}

interface TableSnapshot {
  name: string;
  rowCount: number;
  sha256: string;
}

const source = readDatabaseTarget(
  "TEST_RESTORE_SOURCE_ADMIN_URL",
  process.env.TEST_RESTORE_SOURCE_ADMIN_URL,
);
const target = readDatabaseTarget(
  "TEST_RESTORE_TARGET_ADMIN_URL",
  process.env.TEST_RESTORE_TARGET_ADMIN_URL,
);
const pgBinDirectory = requireAbsoluteDirectory("TEST_PG_BIN_DIR", process.env.TEST_PG_BIN_DIR);
const sourceMediaRoot = requireAbsoluteDirectory(
  "TEST_RESTORE_SOURCE_MEDIA_ROOT",
  process.env.TEST_RESTORE_SOURCE_MEDIA_ROOT,
);
const targetMediaRoot = requireAbsoluteDirectory(
  "TEST_RESTORE_TARGET_MEDIA_ROOT",
  process.env.TEST_RESTORE_TARGET_MEDIA_ROOT,
);

assert.notEqual(
  `${source.host}:${source.port}/${source.database}`,
  `${target.host}:${target.port}/${target.database}`,
  "Restore source and target databases must be different",
);
assert.notEqual(
  resolve(sourceMediaRoot).toLowerCase(),
  resolve(targetMediaRoot).toLowerCase(),
  "Restore source and target media roots must be different",
);

const executableSuffix = process.platform === "win32" ? ".exe" : "";
const pgDumpPath = join(pgBinDirectory, `pg_dump${executableSuffix}`);
const pgRestorePath = join(pgBinDirectory, `pg_restore${executableSuffix}`);
await access(pgDumpPath);
await access(pgRestorePath);

const temporaryBase = resolve(tmpdir());
const workDirectory = await mkdtemp(join(temporaryBase, "resale-postgres-restore-"));
const dumpPath = join(workDirectory, "database.dump");
const mediaBackupRoot = join(workDirectory, "media-backup");
const sourceSql = postgres(source.connectionUrl, { max: 1, prepare: false });
const targetSql = postgres(target.connectionUrl, { max: 1, prepare: false });

try {
  const sourceTableNames = await readPublicTableNames(sourceSql);
  const targetTableNames = await readPublicTableNames(targetSql);
  assert.ok(sourceTableNames.length > 0, "Restore source must contain public tables");
  assert.equal(targetTableNames.length, 0, "Restore target must start with zero public tables");
  await assertDirectoryEmpty(targetMediaRoot);

  const sourceDataSnapshot = await readDataSnapshot(sourceSql);
  const sourceConstraints = await readConstraintSnapshot(sourceSql);
  const sourceRls = await readRlsSnapshot(sourceSql);
  const sourceSequences = await readSequenceSnapshot(sourceSql);
  const sourceMedia = await readMediaRecords(sourceSql);
  assert.ok(sourceMedia.length > 0, "Restore source must contain original-photo metadata");
  const mediaManifestSha256 = await stageMediaBackup(sourceMedia, sourceMediaRoot, mediaBackupRoot);

  await runPostgresTool(
    pgDumpPath,
    [...databaseArguments(source), "--format=custom", "--no-owner", `--file=${dumpPath}`],
    source.password,
  );
  const dumpStats = await stat(dumpPath);
  assert.ok(dumpStats.size > 0, "pg_dump must create a non-empty archive");

  await runPostgresTool(
    pgRestorePath,
    [
      ...databaseArguments(target),
      "--exit-on-error",
      "--single-transaction",
      "--no-owner",
      dumpPath,
    ],
    target.password,
  );

  const targetDataSnapshot = await readDataSnapshot(targetSql);
  const targetConstraints = await readConstraintSnapshot(targetSql);
  const targetRls = await readRlsSnapshot(targetSql);
  const targetSequences = await readSequenceSnapshot(targetSql);
  const targetMedia = await readMediaRecords(targetSql);

  assert.deepEqual(targetDataSnapshot.tables, sourceDataSnapshot.tables);
  assert.equal(targetDataSnapshot.sha256, sourceDataSnapshot.sha256);
  assert.equal(targetDataSnapshot.totalRows, sourceDataSnapshot.totalRows);
  assert.deepEqual(targetConstraints, sourceConstraints);
  assert.ok(
    targetConstraints
      .filter((constraint) => constraint.constraint_type === "f")
      .every((constraint) => constraint.validated),
    "Every restored foreign-key relationship must be validated",
  );
  assert.deepEqual(targetRls, sourceRls);
  assert.deepEqual(targetSequences, sourceSequences);
  assert.deepEqual(targetMedia, sourceMedia);

  await restoreMediaBackup(targetMedia, mediaBackupRoot, targetMediaRoot);
  const restoredMediaManifestSha256 = await verifyMediaFiles(targetMedia, targetMediaRoot);
  assert.equal(restoredMediaManifestSha256, mediaManifestSha256);

  await verifyRestoreSafeCodeHelpers(targetSql);
  await verifyRuntimeRoleAndRls(targetSql);

  const mediaTable = requiredTable(targetDataSnapshot.tables, "media_asset");
  const auditTable = requiredTable(targetDataSnapshot.tables, "audit_event");
  assert.ok(mediaTable.rowCount > 0, "Original-photo metadata must be restored");
  assert.ok(auditTable.rowCount > 0, "Append-only audit history must be restored");

  process.stdout.write(
    `postgres-restore-integration: PASS (tables=${targetDataSnapshot.tables.length}, rows=${targetDataSnapshot.totalRows}, dataSha256=${targetDataSnapshot.sha256}, productMediaRows=${mediaTable.rowCount}, productMediaSha256=${mediaTable.sha256}, privateMediaFiles=${targetMedia.length}, privateMediaFilesSha256=${restoredMediaManifestSha256}, auditRows=${auditTable.rowCount}, auditSha256=${auditTable.sha256}, foreignKeys=${targetConstraints.filter((constraint) => constraint.constraint_type === "f").length}, dumpBytes=${dumpStats.size})\n`,
  );
} finally {
  await Promise.allSettled([sourceSql.end({ timeout: 5 }), targetSql.end({ timeout: 5 })]);
  const relativeWorkDirectory = relative(temporaryBase, resolve(workDirectory));
  assert.ok(
    relativeWorkDirectory.length > 0 &&
      !relativeWorkDirectory.startsWith("..") &&
      !isAbsolute(relativeWorkDirectory),
    "Temporary restore work directory must stay inside the operating-system temp directory",
  );
  await rm(workDirectory, { recursive: true, force: true });
}

function requireAbsoluteDirectory(name: string, rawValue: string | undefined): string {
  assert.ok(rawValue, `${name} is required`);
  assert.ok(isAbsolute(rawValue), `${name} must be an absolute path`);
  return resolve(rawValue);
}

async function readPublicTableNames(sql: DatabaseConnection): Promise<string[]> {
  const rows = await sql<Array<{ table_name: string }>>`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `;
  return rows.map((row) => row.table_name);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function updateLengthPrefixed(hash: ReturnType<typeof createHash>, value: string): void {
  hash.update(String(Buffer.byteLength(value, "utf8")));
  hash.update(":");
  hash.update(value, "utf8");
}

async function readDataSnapshot(
  sql: DatabaseConnection,
): Promise<{ sha256: string; tables: TableSnapshot[]; totalRows: number }> {
  const tables: TableSnapshot[] = [];
  const combinedHash = createHash("sha256");
  let totalRows = 0;

  for (const tableName of await readPublicTableNames(sql)) {
    const rows = await sql.unsafe<Array<{ row_json: string }>>(
      `select to_jsonb(row_value)::text as row_json
       from public.${quoteIdentifier(tableName)} as row_value
       order by to_jsonb(row_value)::text`,
    );
    const tableHash = createHash("sha256");
    for (const row of rows) updateLengthPrefixed(tableHash, row.row_json);
    const snapshot = {
      name: tableName,
      rowCount: rows.length,
      sha256: tableHash.digest("hex"),
    };
    tables.push(snapshot);
    totalRows += rows.length;
    updateLengthPrefixed(combinedHash, JSON.stringify(snapshot));
  }

  return { sha256: combinedHash.digest("hex"), tables, totalRows };
}

async function readConstraintSnapshot(sql: DatabaseConnection) {
  return sql<
    Array<{
      constraint_name: string;
      constraint_type: string;
      deferred: boolean;
      deferrable: boolean;
      definition: string;
      table_name: string;
      validated: boolean;
    }>
  >`
    select relation.relname as table_name,
           constraint_row.conname as constraint_name,
           constraint_row.contype::text as constraint_type,
           pg_get_constraintdef(constraint_row.oid, true) as definition,
           constraint_row.convalidated as validated,
           constraint_row.condeferrable as deferrable,
           constraint_row.condeferred as deferred
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace_row on namespace_row.oid = relation.relnamespace
    where namespace_row.nspname = 'public'
    order by relation.relname, constraint_row.conname
  `;
}

async function readRlsSnapshot(sql: DatabaseConnection) {
  return sql<Array<{ forced: boolean; table_name: string; enabled: boolean }>>`
    select relation.relname as table_name,
           relation.relrowsecurity as enabled,
           relation.relforcerowsecurity as forced
    from pg_class relation
    join pg_namespace namespace_row on namespace_row.oid = relation.relnamespace
    where namespace_row.nspname = 'public' and relation.relkind in ('r', 'p')
    order by relation.relname
  `;
}

async function readSequenceSnapshot(sql: DatabaseConnection) {
  const sequences = await sql<Array<{ sequencename: string } & Record<string, unknown>>>`
    select schemaname, sequencename, sequenceowner, data_type, start_value,
           min_value, max_value, increment_by, cycle, cache_size, last_value
    from pg_sequences
    where schemaname = 'public'
    order by sequencename
  `;
  return Promise.all(
    sequences.map(async (sequence) => {
      const [state] = await sql.unsafe<[{ is_called: boolean; state_last_value: string }]>(
        `select last_value::text as state_last_value, is_called
         from public.${quoteIdentifier(sequence.sequencename)}`,
      );
      assert.ok(state, `Sequence state is missing: ${sequence.sequencename}`);
      return { ...sequence, ...state };
    }),
  );
}

async function readMediaRecords(sql: DatabaseConnection): Promise<MediaRecord[]> {
  const records = await sql<MediaRecord[]>`
    select 'media_asset.original'::text as source,
           original_storage_key as storage_key,
           original_sha256 as sha256,
           size_bytes::integer as size_bytes
    from media_asset
    union all
    select 'receipt_media_asset.original', original_storage_key, original_sha256,
           size_bytes::integer
    from receipt_media_asset
    union all
    select 'location_photo.original', original_storage_key, original_sha256,
           original_size_bytes::integer
    from location_photo
    union all
    select 'location_photo.derivative', derivative_storage_key, derivative_sha256,
           null::integer
    from location_photo
    where derivative_storage_key is not null and derivative_sha256 is not null
    union all
    select 'discrepancy_evidence_media.original', original_storage_key, original_sha256,
           size_bytes::integer
    from discrepancy_evidence_media
    union all
    select 'shipping_photo_asset.original', original_storage_key, original_sha256,
           size_bytes::integer
    from shipping_photo_asset
    order by storage_key, source
  `;
  const storageKeys = new Set<string>();
  return records.map((record) => {
    assert.match(record.sha256, /^[a-f0-9]{64}$/u, `Invalid media SHA-256: ${record.source}`);
    assert.ok(
      !storageKeys.has(record.storage_key),
      `Private media storage key is referenced more than once: ${record.storage_key}`,
    );
    storageKeys.add(record.storage_key);
    return { ...record };
  });
}

function resolveStoragePath(root: string, storageKey: string): string {
  const segments = storageKey.split("/");
  assert.ok(
    segments.length > 0 &&
      segments.every(
        (segment) =>
          segment.length > 0 && segment !== "." && segment !== ".." && !segment.includes(":"),
      ),
    `Unsafe media storage key: ${storageKey}`,
  );
  const candidate = resolve(root, ...segments);
  const relativeCandidate = relative(resolve(root), candidate);
  assert.ok(
    relativeCandidate.length > 0 &&
      !relativeCandidate.startsWith("..") &&
      !isAbsolute(relativeCandidate),
    `Media storage key leaves its configured root: ${storageKey}`,
  );
  return candidate;
}

async function fileSha256(path: string): Promise<string> {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

async function verifyMediaFiles(records: MediaRecord[], root: string): Promise<string> {
  const canonicalRoot = await assertRealDirectory(root, "Media root");
  const manifestHash = createHash("sha256");
  for (const record of records) {
    const path = resolveStoragePath(root, record.storage_key);
    const fileStats = await lstat(path);
    assert.ok(!fileStats.isSymbolicLink(), "Private media must not be a link");
    assert.ok(fileStats.isFile(), `Private media is not a file: ${record.storage_key}`);
    const canonicalPath = await realpath(path);
    assertPathInsideRoot(
      canonicalRoot,
      canonicalPath,
      "Original media must stay inside its real root",
    );
    if (record.size_bytes !== null) {
      assert.equal(
        fileStats.size,
        record.size_bytes,
        `Private media size mismatch: ${record.storage_key}`,
      );
    }
    assert.equal(
      await fileSha256(path),
      record.sha256,
      `Private media SHA-256 mismatch: ${record.storage_key}`,
    );
    updateLengthPrefixed(manifestHash, JSON.stringify(record));
  }
  return manifestHash.digest("hex");
}

async function stageMediaBackup(
  records: MediaRecord[],
  sourceRoot: string,
  backupRoot: string,
): Promise<string> {
  const manifestSha256 = await verifyMediaFiles(records, sourceRoot);
  for (const record of records) {
    const sourcePath = resolveStoragePath(sourceRoot, record.storage_key);
    const backupPath = resolveStoragePath(backupRoot, record.storage_key);
    await mkdir(dirname(backupPath), { recursive: true });
    await copyFile(sourcePath, backupPath);
  }
  assert.equal(await verifyMediaFiles(records, backupRoot), manifestSha256);
  return manifestSha256;
}

async function restoreMediaBackup(
  records: MediaRecord[],
  backupRoot: string,
  restoredRoot: string,
): Promise<void> {
  for (const record of records) {
    const backupPath = resolveStoragePath(backupRoot, record.storage_key);
    const restoredPath = resolveStoragePath(restoredRoot, record.storage_key);
    await mkdir(dirname(restoredPath), { recursive: true });
    await copyFile(backupPath, restoredPath);
  }
}

async function assertDirectoryEmpty(directory: string): Promise<void> {
  try {
    await access(directory);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      await mkdir(directory, { recursive: true });
    } else {
      throw error;
    }
  }
  await assertRealDirectory(directory, "Restore media target");
  assert.equal((await readdir(directory)).length, 0, "Restore media target must start empty");
}

async function assertRealDirectory(directory: string, label: string): Promise<string> {
  const directoryStats = await lstat(directory);
  assert.ok(!directoryStats.isSymbolicLink(), `${label} must not be a link`);
  assert.ok(directoryStats.isDirectory(), `${label} must be a directory`);
  const canonicalDirectory = await realpath(directory);
  assert.equal(
    comparablePath(canonicalDirectory),
    comparablePath(directory),
    `${label} must not traverse a link or junction`,
  );
  return canonicalDirectory;
}

function assertPathInsideRoot(root: string, candidate: string, message: string): void {
  const relativeCandidate = relative(root, candidate);
  assert.ok(
    relativeCandidate.length > 0 &&
      !relativeCandidate.startsWith("..") &&
      !isAbsolute(relativeCandidate),
    message,
  );
}

function comparablePath(path: string): string {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

async function verifyRestoreSafeCodeHelpers(sql: DatabaseConnection): Promise<void> {
  const helpers = await sql<Array<{ name: string; settings: string[] | null }>>`
    select procedure_row.proname as name, procedure_row.proconfig as settings
    from pg_proc procedure_row
    join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace
    where namespace_row.nspname = 'public'
      and procedure_row.proname in (
        'app_code_check_digit',
        'app_append_code_check_digit',
        'app_has_valid_code_check_digit'
      )
    order by procedure_row.proname
  `;
  assert.equal(helpers.length, 3);
  for (const helper of helpers) {
    assert.ok(
      helper.settings?.includes("search_path=pg_catalog, public"),
      `${helper.name} must pin its restore-safe search_path`,
    );
  }
  const [inventory] = await sql<[{ inventory_number: string }]>`
    select inventory_number from inventory_unit order by inventory_number limit 1
  `;
  assert.ok(inventory, "Restore fixture must contain one inventory number");
  await sql.begin(async (transaction) => {
    await transaction`set local search_path = pg_catalog, pg_temp`;
    const [result] = await transaction<[{ valid: boolean }]>`
      select public.app_has_valid_code_check_digit(${inventory.inventory_number}) as valid
    `;
    assert.equal(result.valid, true);
  });
}

async function verifyRuntimeRoleAndRls(sql: DatabaseConnection): Promise<void> {
  const [role] = await sql<
    [
      {
        bypass_rls: boolean;
        can_login: boolean;
        create_database: boolean;
        create_role: boolean;
        inherits: boolean;
        superuser: boolean;
      },
    ]
  >`
    select rolcanlogin as can_login, rolsuper as superuser,
           rolcreatedb as create_database, rolcreaterole as create_role,
           rolinherit as inherits, rolbypassrls as bypass_rls
    from pg_roles where rolname = 'resale_app_runtime'
  `;
  assert.deepEqual(role, {
    bypass_rls: false,
    can_login: false,
    create_database: false,
    create_role: false,
    inherits: false,
    superuser: false,
  });

  const [privileges] = await sql<
    [
      {
        audit_insert: boolean;
        audit_select: boolean;
        product_select: boolean;
        schema_usage: boolean;
        workspace_function_execute: boolean;
      },
    ]
  >`
    select has_schema_privilege('resale_app_runtime', 'public', 'USAGE') as schema_usage,
           has_table_privilege('resale_app_runtime', 'public.product_sku', 'SELECT')
             as product_select,
           has_table_privilege('resale_app_runtime', 'public.audit_event', 'SELECT')
             as audit_select,
           has_table_privilege('resale_app_runtime', 'public.audit_event', 'INSERT')
             as audit_insert,
           has_function_privilege(
             'resale_app_runtime', 'public.app_workspace_id()', 'EXECUTE'
           ) as workspace_function_execute
  `;
  assert.ok(Object.values(privileges).every(Boolean), "Runtime grants must survive restore");

  const [workspace] = await sql<[{ id: string }]>`select id from workspace order by id limit 1`;
  assert.ok(workspace, "Restore fixture must contain one workspace");
  const [expectedProduct] = await sql<[{ count: number }]>`
    select count(*)::integer as count from product_sku where workspace_id = ${workspace.id}
  `;
  const missingWorkspaceId = randomUUID();
  const [missingWorkspace] = await sql<[{ count: number }]>`
    select count(*)::integer as count from workspace where id = ${missingWorkspaceId}
  `;
  assert.equal(missingWorkspace.count, 0, "Generated isolation workspace must not exist");

  const ownWorkspaceCount = await countProductsAsRuntime(sql, workspace.id);
  assert.equal(ownWorkspaceCount, expectedProduct.count);
  assert.equal(await countProductsAsRuntime(sql, missingWorkspaceId), 0);

  await assert.rejects(
    () =>
      sql.begin(async (transaction) => {
        await transaction`set local role resale_app_runtime`;
        await transaction`select set_config('app.workspace_id', ${workspace.id}, true)`;
        await transaction`delete from product_sku where false`;
      }),
    (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "42501",
    "Runtime role must not gain product deletion after restore",
  );
  await assert.rejects(
    () =>
      sql.begin(async (transaction) => {
        await transaction`set local role resale_app_runtime`;
        await transaction`select set_config('app.workspace_id', ${workspace.id}, true)`;
        await transaction`update audit_event set action = action where false`;
      }),
    (error: unknown) =>
      typeof error === "object" && error !== null && "code" in error && error.code === "42501",
    "Runtime role must not gain audit mutation after restore",
  );
}

async function countProductsAsRuntime(
  sql: DatabaseConnection,
  workspaceId: string,
): Promise<number> {
  return sql.begin(async (transaction) => {
    await transaction`set local role resale_app_runtime`;
    await transaction`select set_config('app.workspace_id', ${workspaceId}, true)`;
    const [row] = await transaction<[{ count: number }]>`
      select count(*)::integer as count from product_sku
    `;
    return row.count;
  });
}

function requiredTable(tables: TableSnapshot[], name: string): TableSnapshot {
  const table = tables.find((candidate) => candidate.name === name);
  assert.ok(table, `Required restored table is missing: ${name}`);
  return table;
}
