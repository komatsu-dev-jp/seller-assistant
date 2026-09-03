import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  listingPrepPilotMeasurementTemplates,
  listingPrepPilotWarmupFixture,
  type ListingPrepPilotMeasurementTemplateId,
  type LocationNodeResponse,
  type MediaAssetResponse,
  type MeasurementResponse,
  type P0ItemResponse,
} from "@resale/contracts";
import postgres from "postgres";

import { PostgresAccountingRepository } from "./accounting-repository.js";
import { AesGcmAddressCipher } from "./address-crypto.js";
import { hashPassword } from "./auth.js";
import { assertRestrictedDatabaseRole } from "./db-security.js";
import { inspectImage, LocalPrivateMediaStore } from "./local-media-store.js";
import { PostgresOrderRepository } from "./order-repository.js";
import { PostgresP0ItemRepository } from "./p0-item-repository.js";
import { PostgresWorkflowRepository, type RequestActor } from "./repository.js";
import { PostgresStocktakeRepository } from "./stocktake-repository.js";
import { PostgresTeamRepository } from "./team-repository.js";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const FIXTURE_NAME = "ui-evaluation-v1" as const;
const REQUIRED_MIGRATION = "0033" as const;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

interface SafeDatabaseUrl {
  raw: string;
  hostname: string;
  port: string;
  database: string;
}

interface SeedConfig {
  admin: SafeDatabaseUrl;
  runtime: SafeDatabaseUrl;
  password: string;
  mediaRoot: string;
}

interface SeedAccount {
  identityId: string;
  workspaceId: string;
  email: string;
  role: "owner" | "inventory_manager";
}

interface OwnerPlan {
  identityId: string;
  workspaceId: string;
  email: string;
  displayName: string;
  workspaceName: string;
}

interface StoredProductMedia {
  byRole: Map<MediaAssetResponse["role"], MediaAssetResponse>;
  assets: MediaAssetResponse[];
}

interface PutawayProduct {
  item: P0ItemResponse;
  location: LocationNodeResponse;
}

interface AccountingProduct extends PutawayProduct {
  media: StoredProductMedia;
  measurements: MeasurementResponse[];
  attributeConfirmationId: string;
}

interface UiEvaluationSummary {
  fixture: typeof FIXTURE_NAME;
  migrationVersion: typeof REQUIRED_MIGRATION;
  accounts: Array<{
    task: "solo-stocktake" | "dual-stocktake" | "accounting" | "capture";
    email: string;
    role: SeedAccount["role"];
    workspaceId: string;
  }>;
  tasks: {
    soloStocktake: {
      workspaceId: string;
      ownerEmail: string;
      locationId: string;
      locationCode: string;
      inventoryUnitId: string;
      inventoryNumber: string;
    };
    dualStocktake: {
      workspaceId: string;
      ownerEmail: string;
      managerEmail: string;
      locationId: string;
      locationCode: string;
      inventoryUnitId: string;
      inventoryNumber: string;
    };
    accounting: {
      workspaceId: string;
      ownerEmail: string;
      locationCode: string;
      readyOrderId: string;
      readyOrderNumber: string;
      readySkuId: string;
      blockedOrderId: string;
      blockedOrderNumber: string;
      blockedSkuId: string;
    };
    capture: {
      workspaceId: string;
      ownerEmail: string;
      skus: Array<{
        category: string;
        skuId: string;
        skuCode: string;
        inventoryNumber: string;
        measurementTemplateId: ListingPrepPilotMeasurementTemplateId;
      }>;
      attributeSeed: {
        skuId: string;
        brandTagAssetId: string;
        careLabelAssetId: string;
        candidateId: string;
      };
    };
  };
}

export function parseUiEvaluationDatabaseUrl(raw: string, fieldName: string): SafeDatabaseUrl {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${fieldName} must be a valid PostgreSQL URL`);
  }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new Error(`${fieldName} must use the PostgreSQL protocol`);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new Error(`${fieldName} must use a loopback host`);
  }
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (!/^resale_ui_[a-z0-9_]+$/u.test(database)) {
    throw new Error(`${fieldName} database must start with resale_ui_`);
  }
  if (!parsed.username || parsed.hash) {
    throw new Error(`${fieldName} must identify a database user and contain no fragment`);
  }
  return {
    raw,
    hostname: hostname === "[::1]" ? "::1" : hostname,
    port: parsed.port || "5432",
    database,
  };
}

export function assertMatchingUiEvaluationDatabases(
  admin: SafeDatabaseUrl,
  runtime: SafeDatabaseUrl,
): void {
  if (
    admin.hostname !== runtime.hostname ||
    admin.port !== runtime.port ||
    admin.database !== runtime.database
  ) {
    throw new Error("Admin and runtime URLs must target the same loopback UI evaluation database");
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function safeUiEvaluationFailureMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";

  if (["EACCES", "EPERM", "ENOENT", "ENOTDIR"].includes(code)) {
    return "media directory safety check failed";
  }
  if (message.includes("UI_EVALUATION_MEDIA_ROOT")) {
    return "media directory safety check failed";
  }
  if (message.includes("UI_EVALUATION_PASSWORD")) {
    return "test password safety check failed";
  }
  if (message.includes("UI evaluation database must be completely empty")) {
    return "evaluation database is not empty";
  }
  if (
    message.includes("UI_EVALUATION_DATABASE") ||
    message.includes("loopback") ||
    message.includes("database role") ||
    message.includes("connected database") ||
    message.includes("Migration 0033") ||
    message.includes("destructive business-table privileges")
  ) {
    return "database isolation safety check failed";
  }
  if (message.endsWith(" is required")) {
    return "required evaluation configuration is missing";
  }
  return "safety gate or seed operation rejected";
}

async function loadConfig(): Promise<SeedConfig> {
  const admin = parseUiEvaluationDatabaseUrl(
    requiredEnvironment("UI_EVALUATION_DATABASE_ADMIN_URL"),
    "UI_EVALUATION_DATABASE_ADMIN_URL",
  );
  const runtime = parseUiEvaluationDatabaseUrl(
    requiredEnvironment("UI_EVALUATION_DATABASE_URL"),
    "UI_EVALUATION_DATABASE_URL",
  );
  assertMatchingUiEvaluationDatabases(admin, runtime);
  const password = requiredEnvironment("UI_EVALUATION_PASSWORD");
  if (password.length < 12 || password.length > 128) {
    throw new Error("UI_EVALUATION_PASSWORD must contain 12 to 128 characters");
  }
  const mediaRoot = resolve(requiredEnvironment("UI_EVALUATION_MEDIA_ROOT"));
  if (!isAbsolute(mediaRoot)) {
    throw new Error("UI_EVALUATION_MEDIA_ROOT must be an absolute path");
  }
  const fromRepository = relative(REPOSITORY_ROOT, mediaRoot);
  if (fromRepository === "" || (!fromRepository.startsWith("..") && !isAbsolute(fromRepository))) {
    throw new Error("UI_EVALUATION_MEDIA_ROOT must be outside the repository");
  }
  await mkdir(mediaRoot, { recursive: true, mode: 0o700 });
  const metadata = await lstat(mediaRoot);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error("UI_EVALUATION_MEDIA_ROOT must be a real directory");
  }
  const canonicalMediaRoot = await realpath(mediaRoot);
  const entries = await readdir(canonicalMediaRoot);
  if (entries.length !== 0) {
    throw new Error("UI_EVALUATION_MEDIA_ROOT must be empty");
  }
  return { admin, runtime, password, mediaRoot: canonicalMediaRoot };
}

function ownerPlans(): {
  solo: OwnerPlan;
  dual: OwnerPlan;
  accounting: OwnerPlan;
  capture: OwnerPlan;
} {
  return {
    solo: {
      identityId: randomUUID(),
      workspaceId: randomUUID(),
      email: "ui-solo-owner@example.test",
      displayName: "UI評価 ソロ棚卸オーナー",
      workspaceName: "UI評価 ソロ棚卸",
    },
    dual: {
      identityId: randomUUID(),
      workspaceId: randomUUID(),
      email: "ui-dual-owner@example.test",
      displayName: "UI評価 二人棚卸オーナー",
      workspaceName: "UI評価 二人棚卸",
    },
    accounting: {
      identityId: randomUUID(),
      workspaceId: randomUUID(),
      email: "ui-accounting-owner@example.test",
      displayName: "UI評価 会計オーナー",
      workspaceName: "UI評価 会計",
    },
    capture: {
      identityId: randomUUID(),
      workspaceId: randomUUID(),
      email: "ui-capture-owner@example.test",
      displayName: "UI評価 撮影オーナー",
      workspaceName: "UI評価 撮影",
    },
  };
}

async function runtimeDatabaseUser(databaseUrl: string): Promise<string> {
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 10 });
  try {
    const rows = await sql<Array<{ current_user: string }>>`select current_user`;
    const user = rows[0]?.current_user;
    if (!user) throw new Error("The runtime database role cannot be identified");
    return user;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function createInitialOwners(
  config: SeedConfig,
  plans: ReturnType<typeof ownerPlans>,
  runtimeUser: string,
): Promise<Record<keyof ReturnType<typeof ownerPlans>, SeedAccount>> {
  const planEntries = Object.entries(plans) as Array<
    [keyof ReturnType<typeof ownerPlans>, OwnerPlan]
  >;
  const credentials: Array<Awaited<ReturnType<typeof hashPassword>>> = [];
  for (let index = 0; index < planEntries.length; index += 1) {
    credentials.push(await hashPassword(config.password));
  }
  const sql = postgres(config.admin.raw, { max: 1, connect_timeout: 10 });
  try {
    await sql.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtextextended(${`${config.admin.database}:${FIXTURE_NAME}`}, 0))`;
      await assertEmptyCurrentDatabase(transaction, config.admin.database, runtimeUser);

      // There is intentionally no production path for provisioning several independent
      // first-owner workspaces. This admin-only insert is allowed only after the empty-DB gate;
      // every business record below is created through the production repositories.
      for (const [[, plan], credential] of planEntries.map(
        (entry, index) => [entry, credentials[index]] as const,
      )) {
        assert(credential);
        await transaction`
          insert into app_identity (id, display_name)
          values (${plan.identityId}, ${plan.displayName})
        `;
        await transaction`
          insert into workspace (id, name)
          values (${plan.workspaceId}, ${plan.workspaceName})
        `;
        await transaction`
          insert into workspace_membership (workspace_id, identity_id, role, active)
          values (${plan.workspaceId}, ${plan.identityId}, 'owner', true)
        `;
        await transaction`
          insert into auth_credential (
            identity_id, email_normalized, password_hash, password_salt,
            hash_algorithm, scrypt_n, scrypt_r, scrypt_p
          ) values (
            ${plan.identityId}, ${plan.email}, ${credential.hash}, ${credential.salt},
            'scrypt-v1', ${credential.n}, ${credential.r}, ${credential.p}
          )
        `;
      }
    });
  } finally {
    for (const credential of credentials) {
      credential.hash.fill(0);
      credential.salt.fill(0);
    }
    await sql.end({ timeout: 5 });
  }
  return Object.fromEntries(
    planEntries.map(([key, plan]) => [
      key,
      {
        identityId: plan.identityId,
        workspaceId: plan.workspaceId,
        email: plan.email,
        role: "owner" as const,
      },
    ]),
  ) as Record<keyof ReturnType<typeof ownerPlans>, SeedAccount>;
}

async function assertEmptyCurrentDatabase(
  transaction: postgres.TransactionSql,
  expectedDatabase: string,
  runtimeUser: string,
): Promise<void> {
  const stateRows = await transaction<
    Array<{
      database_name: string;
      admin_user: string;
      workspace_count: number;
      identity_count: number;
      credential_count: number;
      membership_count: number;
      profile_table: string | null;
      attribute_table: string | null;
      color_column: boolean;
    }>
  >`
    select current_database() as database_name,
           current_user as admin_user,
           (select count(*)::integer from workspace) as workspace_count,
           (select count(*)::integer from app_identity) as identity_count,
           (select count(*)::integer from auth_credential) as credential_count,
           (select count(*)::integer from workspace_membership) as membership_count,
           to_regclass('public.product_measurement_profile')::text as profile_table,
           to_regclass('public.product_attribute_confirmation')::text as attribute_table,
           exists (
             select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'product_identity_candidate'
               and column_name = 'color_candidate'
           ) as color_column
  `;
  const state = stateRows[0];
  if (!state || state.database_name !== expectedDatabase) {
    throw new Error("The connected database does not match the gated UI evaluation database");
  }
  if (state.admin_user === runtimeUser) {
    throw new Error("Admin and restricted runtime database roles must be different");
  }
  if (
    state.workspace_count !== 0 ||
    state.identity_count !== 0 ||
    state.credential_count !== 0 ||
    state.membership_count !== 0
  ) {
    throw new Error("The UI evaluation database must be completely empty");
  }
  if (!state.profile_table || !state.attribute_table || !state.color_column) {
    throw new Error("Migration 0033 schema objects are missing");
  }

  const constraints = await transaction<Array<{ definition: string }>>`
    select pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid = 'pilot_run'::regclass
      and conname = 'pilot_run_migration_version_check'
  `;
  if (!constraints[0]?.definition.includes("0033")) {
    throw new Error("Migration 0033 is not applied");
  }

  const protectedTables = ["product_measurement_profile", "product_attribute_confirmation"];
  const protections = await transaction<
    Array<{ table_name: string; row_security: boolean; force_row_security: boolean }>
  >`
    select relation.relname as table_name,
           relation.relrowsecurity as row_security,
           relation.relforcerowsecurity as force_row_security
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname in ${transaction(protectedTables)}
    order by relation.relname
  `;
  if (
    protections.length !== protectedTables.length ||
    protections.some((row) => !row.row_security || !row.force_row_security)
  ) {
    throw new Error("Migration 0033 row-level security is incomplete");
  }

  const requiredTriggers = [
    "product_measurement_profile_insert_guard",
    "product_measurement_profile_immutable_guard",
    "product_attribute_confirmation_insert_guard",
    "product_attribute_confirmation_append_only_guard",
  ];
  const triggers = await transaction<Array<{ trigger_name: string; enabled: string }>>`
    select trigger_name.tgname as trigger_name, trigger_name.tgenabled as enabled
    from pg_trigger trigger_name
    where trigger_name.tgname in ${transaction(requiredTriggers)}
      and not trigger_name.tgisinternal
    order by trigger_name.tgname
  `;
  if (
    triggers.length !== requiredTriggers.length ||
    triggers.some((trigger) => trigger.enabled !== "O")
  ) {
    throw new Error("Migration 0033 safety triggers are missing or disabled");
  }

  const dangerous = await transaction<
    Array<{ table_name: string; can_delete: boolean; can_truncate: boolean; can_trigger: boolean }>
  >`
    select table_name,
           has_table_privilege(${runtimeUser}, format('%I.%I', 'public', table_name), 'DELETE') as can_delete,
           has_table_privilege(${runtimeUser}, format('%I.%I', 'public', table_name), 'TRUNCATE') as can_truncate,
           has_table_privilege(${runtimeUser}, format('%I.%I', 'public', table_name), 'TRIGGER') as can_trigger
    from (
      select distinct table_name
      from information_schema.columns
      where table_schema = 'public' and column_name = 'workspace_id'
    ) workspace_table
  `;
  if (dangerous.some((row) => row.can_delete || row.can_truncate || row.can_trigger)) {
    throw new Error("The runtime database role has destructive business-table privileges");
  }
}

function actor(account: SeedAccount): RequestActor {
  return { identityId: account.identityId, workspaceId: account.workspaceId };
}

function iso(offsetMilliseconds = 0): string {
  return new Date(Date.now() + offsetMilliseconds).toISOString();
}

async function createPutawayProduct(input: {
  account: SeedAccount;
  p0: PostgresP0ItemRepository;
  workflow: PostgresWorkflowRepository;
  skuCode: string;
  title: string;
  category?: "tops" | "outer" | "pants" | "knit";
  measurementTemplateId?: ListingPrepPilotMeasurementTemplateId;
  location?: LocationNodeResponse;
  locationCode?: string;
  locationName?: string;
}): Promise<PutawayProduct> {
  const selectedCategory = input.category ?? "tops";
  const templateId = input.measurementTemplateId ?? "tops_standard_v1";
  const item = await input.p0.createItem(input.account.workspaceId, actor(input.account), {
    skuCode: input.skuCode,
    title: input.title,
    category: selectedCategory,
    measurementTemplateId: templateId,
    supplierName: "架空仕入先 UI評価",
    receiptReference: `UI-${input.skuCode}`,
    purchasedAt: iso(-24 * 60 * 60 * 1000),
    receiptAmountMinor: 1800,
    allocatedCostMinor: 1800,
    idempotencyKey: randomUUID(),
    humanConfirmed: true,
  });
  const location =
    input.location ??
    (await input.p0.createLocation(input.account.workspaceId, actor(input.account), {
      parentId: null,
      code: input.locationCode ?? "UI-A1",
      name: input.locationName ?? "UI評価保管棚",
      canStoreInventory: true,
      singleItemOnly: false,
      allowMixedSku: true,
      maxUnits: 20,
      humanConfirmed: true,
    }));
  await input.workflow.putawayInventory(input.account.workspaceId, actor(input.account), {
    inventoryNumber: item.inventoryNumber,
    locationCode: location.code,
    inventoryLabelVersion: item.inventoryLabelVersion,
    locationLabelVersion: location.labelVersion,
    inventoryScannedAt: iso(-2_000),
    locationScannedAt: iso(-1_000),
    confirmedAt: iso(),
    idempotencyKey: randomUUID(),
    humanConfirmed: true,
  });
  return { item, location };
}

async function createCaptureOnlyProduct(input: {
  account: SeedAccount;
  p0: PostgresP0ItemRepository;
  skuCode: string;
  title: string;
  category: "tops" | "outer" | "pants" | "knit";
  measurementTemplateId: ListingPrepPilotMeasurementTemplateId;
}): Promise<P0ItemResponse> {
  return input.p0.createItem(input.account.workspaceId, actor(input.account), {
    skuCode: input.skuCode,
    title: input.title,
    category: input.category,
    measurementTemplateId: input.measurementTemplateId,
    supplierName: "架空仕入先 UI評価",
    receiptReference: `UI-${input.skuCode}`,
    purchasedAt: iso(-24 * 60 * 60 * 1000),
    receiptAmountMinor: 1500,
    allocatedCostMinor: 1500,
    idempotencyKey: randomUUID(),
    humanConfirmed: true,
  });
}

async function registerWarmupMedia(input: {
  account: SeedAccount;
  skuId: string;
  skuCode: string;
  workflow: PostgresWorkflowRepository;
  mediaStore: LocalPrivateMediaStore;
  roles?: ReadonlySet<MediaAssetResponse["role"]>;
}): Promise<StoredProductMedia> {
  const assets: MediaAssetResponse[] = [];
  for (const image of listingPrepPilotWarmupFixture.images) {
    if (input.roles && !input.roles.has(image.role)) continue;
    const bytes = await readFile(resolve(REPOSITORY_ROOT, image.relativePath));
    const inspected = inspectImage(bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (
      sha256 !== image.sha256 ||
      bytes.length !== image.bytes ||
      inspected.mimeType !== image.mimeType ||
      inspected.width !== image.width ||
      inspected.height !== image.height
    ) {
      throw new Error("A generated local fixture image failed its integrity check");
    }
    const assetId = randomUUID();
    const storageKey = `workspaces/${input.account.workspaceId}/originals/${input.skuCode.toLowerCase()}-${image.role}-${assetId}.png`;
    const stored = await input.mediaStore.saveOriginal(storageKey, bytes);
    if (!stored.created || stored.sha256 !== image.sha256 || stored.sizeBytes !== image.bytes) {
      throw new Error("A UI evaluation original was not created exactly once");
    }
    assets.push(
      await input.workflow.registerMediaAsset(
        input.account.workspaceId,
        input.skuId,
        actor(input.account),
        {
          assetId,
          role: image.role,
          originalSha256: stored.sha256,
          originalStorageKey: stored.storageKey,
          mimeType: inspected.mimeType,
          sizeBytes: stored.sizeBytes,
          width: inspected.width,
          height: inspected.height,
        },
      ),
    );
  }
  return { byRole: new Map(assets.map((asset) => [asset.role, asset])), assets };
}

async function recordWarmupMeasurements(input: {
  account: SeedAccount;
  skuId: string;
  evidenceAssetId: string;
  workflow: PostgresWorkflowRepository;
}): Promise<MeasurementResponse[]> {
  const measurements: MeasurementResponse[] = [];
  for (const definition of listingPrepPilotWarmupFixture.measurements) {
    measurements.push(
      await input.workflow.recordMeasurement(
        input.account.workspaceId,
        input.skuId,
        actor(input.account),
        {
          definitionId: definition.definitionId,
          definitionVersion: definition.definitionVersion,
          value: definition.value,
          unit: definition.unit,
          basis: definition.basis,
          state: definition.state,
          measuredAt: iso(),
          evidenceAssetId: input.evidenceAssetId,
          attempt: 1,
          humanConfirmed: true,
        },
      ),
    );
  }
  return measurements;
}

async function prepareAccountingProduct(input: {
  account: SeedAccount;
  p0: PostgresP0ItemRepository;
  workflow: PostgresWorkflowRepository;
  mediaStore: LocalPrivateMediaStore;
  location: LocationNodeResponse;
  skuCode: string;
  title: string;
}): Promise<AccountingProduct> {
  const product = await createPutawayProduct({
    account: input.account,
    p0: input.p0,
    workflow: input.workflow,
    skuCode: input.skuCode,
    title: input.title,
    location: input.location,
  });
  const media = await registerWarmupMedia({
    account: input.account,
    skuId: product.item.skuId,
    skuCode: product.item.skuCode,
    workflow: input.workflow,
    mediaStore: input.mediaStore,
  });
  const front = media.byRole.get("front");
  const brandTag = media.byRole.get("brand_tag");
  if (!front || !brandTag || media.assets.length !== 4) {
    throw new Error("The accounting product needs all four generated images");
  }
  const measurements = await recordWarmupMeasurements({
    account: input.account,
    skuId: product.item.skuId,
    evidenceAssetId: front.assetId,
    workflow: input.workflow,
  });
  const attributes = await input.p0.confirmProductAttributes(
    input.account.workspaceId,
    product.item.skuId,
    actor(input.account),
    {
      brand: listingPrepPilotWarmupFixture.attributes.brand,
      sizeLabel: listingPrepPilotWarmupFixture.attributes.sizeLabel,
      color: listingPrepPilotWarmupFixture.attributes.color,
      evidenceAssetId: brandTag.assetId,
      sourceCandidateId: null,
      supersedesConfirmationId: null,
      humanConfirmed: true,
    },
  );
  await input.workflow.advanceP0Workflow(
    input.account.workspaceId,
    product.item.skuId,
    actor(input.account),
    {
      action: "confirm_capture",
      evidenceReferenceIds: media.assets.map((asset) => asset.assetId),
      idempotencyKey: randomUUID(),
      requiredFactsConfirmed: true,
      manualChannelHandoff: false,
    },
  );
  await input.workflow.advanceP0Workflow(
    input.account.workspaceId,
    product.item.skuId,
    actor(input.account),
    {
      action: "confirm_listing",
      evidenceReferenceIds: [
        ...media.assets.map((asset) => asset.assetId),
        ...measurements.map((measurement) => measurement.id),
        attributes.confirmationId,
      ],
      idempotencyKey: randomUUID(),
      requiredFactsConfirmed: true,
      manualChannelHandoff: true,
    },
  );
  return {
    ...product,
    media,
    measurements,
    attributeConfirmationId: attributes.confirmationId,
  };
}

async function createAndShipOrder(input: {
  account: SeedAccount;
  orderRepository: PostgresOrderRepository;
  product: AccountingProduct;
  orderNumber: string;
  taxBasis: "tax_included" | "unknown";
  cipher: AesGcmAddressCipher;
}): Promise<{ orderId: string; orderNumber: string }> {
  const orderId = randomUUID();
  const shippingAddress = "〒000-0000 東京都架空区UI評価1-2-3 架空テスト宛";
  await input.orderRepository.createOrder(input.account.workspaceId, actor(input.account), {
    orderId,
    encryptedAddress: input.cipher.encrypt(input.account.workspaceId, orderId, shippingAddress),
    addressFingerprint: input.cipher.fingerprint(
      input.account.workspaceId,
      orderId,
      shippingAddress,
    ),
    input: {
      orderNumber: input.orderNumber,
      skuId: input.product.item.skuId,
      inventoryUnitId: input.product.item.inventoryUnitId,
      saleAmountMinor: 5_800,
      costAmountMinor: 1_800,
      sellingFeeMinor: 580,
      shippingCostMinor: 750,
      packagingCostMinor: 120,
      taxBasis: input.taxBasis,
      sourceMeaning: "UI評価用の架空手入力取引",
      occurredAt: iso(-60_000),
      addressMode: "stored",
      shippingAddress,
      idempotencyKey: randomUUID(),
      humanConfirmed: true,
    },
  });
  const lease = await input.orderRepository.createAddressLease(
    input.account.workspaceId,
    orderId,
    actor(input.account),
    { purpose: "shipping_label", humanConfirmed: true },
  );
  await input.orderRepository.pickOrder(input.account.workspaceId, orderId, actor(input.account), {
    inventoryNumber: input.product.item.inventoryNumber,
    locationCode: input.product.location.code,
    inventoryLabelVersion: input.product.item.inventoryLabelVersion,
    locationLabelVersion: input.product.location.labelVersion,
    inventoryScannedAt: iso(-2_000),
    locationScannedAt: iso(-1_000),
    confirmedAt: iso(),
    idempotencyKey: randomUUID(),
    humanConfirmed: true,
    addressLeaseId: lease.leaseId,
  });
  await input.orderRepository.packOrder(input.account.workspaceId, orderId, actor(input.account), {
    addressLeaseId: lease.leaseId,
    idempotencyKey: randomUUID(),
    humanConfirmed: true,
  });
  await input.orderRepository.shipOrder(input.account.workspaceId, orderId, actor(input.account), {
    addressLeaseId: lease.leaseId,
    idempotencyKey: randomUUID(),
    humanConfirmed: true,
  });
  return { orderId, orderNumber: input.orderNumber };
}

function requireRoleAsset(
  media: StoredProductMedia,
  role: "brand_tag" | "care_label",
): MediaAssetResponse {
  const asset = media.byRole.get(role);
  if (!asset) throw new Error(`The ${role} local fixture asset is missing`);
  return asset;
}

async function seedUiEvaluation(): Promise<UiEvaluationSummary> {
  const config = await loadConfig();
  await assertRestrictedDatabaseRole(config.runtime.raw);
  const runtimeUser = await runtimeDatabaseUser(config.runtime.raw);
  const plans = ownerPlans();
  const accounts = await createInitialOwners(config, plans, runtimeUser);
  const p0 = new PostgresP0ItemRepository(config.runtime.raw);
  const workflow = new PostgresWorkflowRepository(config.runtime.raw);
  const orderRepository = new PostgresOrderRepository(config.runtime.raw);
  const accountingRepository = new PostgresAccountingRepository(config.runtime.raw);
  const stocktakeRepository = new PostgresStocktakeRepository(config.runtime.raw);
  const teamRepository = new PostgresTeamRepository(config.runtime.raw);
  const mediaStore = new LocalPrivateMediaStore(config.mediaRoot);
  try {
    const manager = await teamRepository.createMember(
      accounts.dual.workspaceId,
      actor(accounts.dual),
      {
        displayName: "UI評価 二人棚卸担当",
        email: "ui-dual-manager@example.test",
        initialPassword: config.password,
        role: "inventory_manager",
        humanConfirmed: true,
      },
    );
    const dualManager: SeedAccount = {
      identityId: manager.identityId,
      workspaceId: accounts.dual.workspaceId,
      email: manager.email,
      role: "inventory_manager",
    };

    const soloProduct = await createPutawayProduct({
      account: accounts.solo,
      p0,
      workflow,
      skuCode: "UI-SOLO-001",
      title: "架空商品 ソロ棚卸確認用",
      locationCode: "UI-SOLO-A1",
      locationName: "ソロ棚卸 棚A1",
    });
    const dualProduct = await createPutawayProduct({
      account: accounts.dual,
      p0,
      workflow,
      skuCode: "UI-DUAL-001",
      title: "架空商品 二人棚卸確認用",
      locationCode: "UI-DUAL-A1",
      locationName: "二人棚卸 棚A1",
    });

    const accountingLocation = await p0.createLocation(
      accounts.accounting.workspaceId,
      actor(accounts.accounting),
      {
        parentId: null,
        code: "UI-ACCT-A1",
        name: "会計評価 発送前棚A1",
        canStoreInventory: true,
        singleItemOnly: false,
        allowMixedSku: true,
        maxUnits: 20,
        humanConfirmed: true,
      },
    );
    const blockedProduct = await prepareAccountingProduct({
      account: accounts.accounting,
      p0,
      workflow,
      mediaStore,
      location: accountingLocation,
      skuCode: "UI-ACCT-BLOCKED",
      title: "架空商品 税区分未確認",
    });
    const readyProduct = await prepareAccountingProduct({
      account: accounts.accounting,
      p0,
      workflow,
      mediaStore,
      location: accountingLocation,
      skuCode: "UI-ACCT-READY",
      title: "架空商品 CSV作成確認用",
    });
    const cipherKey = randomBytes(32);
    const cipher = new AesGcmAddressCipher(cipherKey.toString("hex"));
    cipherKey.fill(0);
    const blockedOrder = await createAndShipOrder({
      account: accounts.accounting,
      orderRepository,
      product: blockedProduct,
      orderNumber: "UI-ORDER-BLOCKED",
      taxBasis: "unknown",
      cipher,
    });
    const readyOrder = await createAndShipOrder({
      account: accounts.accounting,
      orderRepository,
      product: readyProduct,
      orderNumber: "UI-ORDER-READY",
      taxBasis: "tax_included",
      cipher,
    });

    const captureDefinitions = [
      ["UI-CAP-TOPS", "架空商品 トップス撮影", "tops", "tops_standard_v1"],
      ["UI-CAP-OUTER", "架空商品 アウター撮影", "outer", "outer_standard_v1"],
      ["UI-CAP-PANTS", "架空商品 パンツ5採寸", "pants", "pants_standard_v1"],
      ["UI-CAP-KNIT", "架空商品 ニット伸ばさず採寸", "knit", "knit_set_in_v1"],
    ] as const;
    const captureItems: Array<{
      item: P0ItemResponse;
      measurementTemplateId: ListingPrepPilotMeasurementTemplateId;
    }> = [];
    for (const [skuCode, title, category, measurementTemplateId] of captureDefinitions) {
      captureItems.push({
        item: await createCaptureOnlyProduct({
          account: accounts.capture,
          p0,
          skuCode,
          title,
          category,
          measurementTemplateId,
        }),
        measurementTemplateId,
      });
    }
    const captureTop = captureItems[0];
    assert(captureTop);
    const captureTagMedia = await registerWarmupMedia({
      account: accounts.capture,
      skuId: captureTop.item.skuId,
      skuCode: captureTop.item.skuCode,
      workflow,
      mediaStore,
      roles: new Set(["brand_tag", "care_label"]),
    });
    const captureBrandTag = requireRoleAsset(captureTagMedia, "brand_tag");
    const captureCareLabel = requireRoleAsset(captureTagMedia, "care_label");
    const captureCandidate = await p0.createIdentityCandidate(
      accounts.capture.workspaceId,
      captureTop.item.skuId,
      actor(accounts.capture),
      {
        sourceAssetId: captureBrandTag.assetId,
        rawOcrText:
          "UI TEST BRAND\nサイズ: M\nカラー: ブルー\n素材: コットン100%\n品番: UITEST-001",
        humanConfirmedSource: true,
      },
    );

    await assertRepositoryReadSmoke({
      accounts: { ...accounts, dualManager },
      p0,
      stocktakeRepository,
      accountingRepository,
      soloProduct,
      dualProduct,
      readyOrder,
      blockedOrder,
      captureItems,
      captureCandidateId: captureCandidate.candidateId,
    });

    return {
      fixture: FIXTURE_NAME,
      migrationVersion: REQUIRED_MIGRATION,
      accounts: [
        {
          task: "solo-stocktake",
          email: accounts.solo.email,
          role: accounts.solo.role,
          workspaceId: accounts.solo.workspaceId,
        },
        {
          task: "dual-stocktake",
          email: accounts.dual.email,
          role: accounts.dual.role,
          workspaceId: accounts.dual.workspaceId,
        },
        {
          task: "dual-stocktake",
          email: dualManager.email,
          role: dualManager.role,
          workspaceId: dualManager.workspaceId,
        },
        {
          task: "accounting",
          email: accounts.accounting.email,
          role: accounts.accounting.role,
          workspaceId: accounts.accounting.workspaceId,
        },
        {
          task: "capture",
          email: accounts.capture.email,
          role: accounts.capture.role,
          workspaceId: accounts.capture.workspaceId,
        },
      ],
      tasks: {
        soloStocktake: {
          workspaceId: accounts.solo.workspaceId,
          ownerEmail: accounts.solo.email,
          locationId: soloProduct.location.id,
          locationCode: soloProduct.location.code,
          inventoryUnitId: soloProduct.item.inventoryUnitId,
          inventoryNumber: soloProduct.item.inventoryNumber,
        },
        dualStocktake: {
          workspaceId: accounts.dual.workspaceId,
          ownerEmail: accounts.dual.email,
          managerEmail: dualManager.email,
          locationId: dualProduct.location.id,
          locationCode: dualProduct.location.code,
          inventoryUnitId: dualProduct.item.inventoryUnitId,
          inventoryNumber: dualProduct.item.inventoryNumber,
        },
        accounting: {
          workspaceId: accounts.accounting.workspaceId,
          ownerEmail: accounts.accounting.email,
          locationCode: accountingLocation.code,
          readyOrderId: readyOrder.orderId,
          readyOrderNumber: readyOrder.orderNumber,
          readySkuId: readyProduct.item.skuId,
          blockedOrderId: blockedOrder.orderId,
          blockedOrderNumber: blockedOrder.orderNumber,
          blockedSkuId: blockedProduct.item.skuId,
        },
        capture: {
          workspaceId: accounts.capture.workspaceId,
          ownerEmail: accounts.capture.email,
          skus: captureItems.map(({ item, measurementTemplateId }) => ({
            category: item.category ?? "",
            skuId: item.skuId,
            skuCode: item.skuCode,
            inventoryNumber: item.inventoryNumber,
            measurementTemplateId,
          })),
          attributeSeed: {
            skuId: captureTop.item.skuId,
            brandTagAssetId: captureBrandTag.assetId,
            careLabelAssetId: captureCareLabel.assetId,
            candidateId: captureCandidate.candidateId,
          },
        },
      },
    };
  } finally {
    await Promise.allSettled([
      p0.close(),
      workflow.close(),
      orderRepository.close(),
      accountingRepository.close(),
      stocktakeRepository.close(),
      teamRepository.close(),
    ]);
  }
}

async function assertRepositoryReadSmoke(input: {
  accounts: Record<keyof ReturnType<typeof ownerPlans>, SeedAccount> & {
    dualManager: SeedAccount;
  };
  p0: PostgresP0ItemRepository;
  stocktakeRepository: PostgresStocktakeRepository;
  accountingRepository: PostgresAccountingRepository;
  soloProduct: PutawayProduct;
  dualProduct: PutawayProduct;
  readyOrder: { orderId: string; orderNumber: string };
  blockedOrder: { orderId: string; orderNumber: string };
  captureItems: Array<{
    item: P0ItemResponse;
    measurementTemplateId: ListingPrepPilotMeasurementTemplateId;
  }>;
  captureCandidateId: string;
}): Promise<void> {
  const [soloStocktakes, dualStocktakes] = await Promise.all([
    input.stocktakeRepository.list(input.accounts.solo.workspaceId, actor(input.accounts.solo)),
    input.stocktakeRepository.list(input.accounts.dual.workspaceId, actor(input.accounts.dual)),
  ]);
  assert.equal(soloStocktakes.length, 0, "Solo stocktake must remain unstarted");
  assert.equal(dualStocktakes.length, 0, "Dual stocktake must remain unstarted");
  const [soloItems, dualItems] = await Promise.all([
    input.p0.listItems(input.accounts.solo.workspaceId, actor(input.accounts.solo)),
    input.p0.listItems(input.accounts.dual.workspaceId, actor(input.accounts.dual)),
  ]);
  assert.equal(soloItems[0]?.inventoryStatus, "available");
  assert.equal(soloItems[0]?.locationCode, input.soloProduct.location.code);
  assert.equal(dualItems[0]?.inventoryStatus, "available");
  assert.equal(dualItems[0]?.locationCode, input.dualProduct.location.code);

  const [profile, mappings, readyOrders, readyExports, blockedExports] = await Promise.all([
    input.accountingRepository.getProfile(
      input.accounts.accounting.workspaceId,
      actor(input.accounts.accounting),
    ),
    input.accountingRepository.listMappingRules(
      input.accounts.accounting.workspaceId,
      actor(input.accounts.accounting),
    ),
    input.accountingRepository.listReadyOrders(
      input.accounts.accounting.workspaceId,
      actor(input.accounts.accounting),
    ),
    input.accountingRepository.listExports(
      input.accounts.accounting.workspaceId,
      input.readyOrder.orderId,
      actor(input.accounts.accounting),
    ),
    input.accountingRepository.listExports(
      input.accounts.accounting.workspaceId,
      input.blockedOrder.orderId,
      actor(input.accounts.accounting),
    ),
  ]);
  assert.deepEqual(
    [
      profile.businessContext,
      profile.filingContext,
      profile.consumptionTaxTreatment,
      profile.invoiceRegistrationStatus,
      profile.bookkeepingMethod,
    ],
    ["unconfigured", "unconfigured", "unconfigured", "unconfigured", "unconfigured"],
  );
  assert.equal(profile.humanConfirmedBy, null);
  assert.equal(mappings.length, 0, "Mapping candidates must remain unapproved");
  assert.deepEqual(
    new Set(readyOrders.map((order) => order.orderId)),
    new Set([input.readyOrder.orderId, input.blockedOrder.orderId]),
  );
  assert.equal(
    readyOrders.every((order) => order.orderState === "shipped" && order.financialEventCount === 5),
    true,
  );
  assert.equal(readyExports.length, 0);
  assert.equal(blockedExports.length, 0);

  const captureTasks = await input.p0.captureTasks(
    input.accounts.capture.workspaceId,
    actor(input.accounts.capture),
  );
  assert.equal(captureTasks.length, 4);
  for (const seeded of input.captureItems) {
    const task = captureTasks.find((candidate) => candidate.skuId === seeded.item.skuId);
    assert(task?.measurementProfile);
    assert.equal(task.measurementProfile.measurementTemplateId, seeded.measurementTemplateId);
    assert.deepEqual(
      task.measurementProfile.definitions.map((definition) => definition.definitionId),
      listingPrepPilotMeasurementTemplates[seeded.measurementTemplateId].measurements.map(
        (definition) => definition.definitionId,
      ),
    );
  }
  const pants = captureTasks.find(
    (task) => task.measurementProfile?.measurementTemplateId === "pants_standard_v1",
  );
  const knit = captureTasks.find(
    (task) => task.measurementProfile?.measurementTemplateId === "knit_set_in_v1",
  );
  assert.equal(pants?.measurementProfile?.definitions.length, 5);
  assert.equal(
    knit?.measurementProfile?.definitions.every((definition) => definition.state === "unstretched"),
    true,
  );
  const research = await input.p0.productResearch(
    input.accounts.capture.workspaceId,
    input.captureItems[0]?.item.skuId ?? "",
    actor(input.accounts.capture),
  );
  assert.equal(research.confirmedAttributes, null);
  assert.equal(research.candidates.length, 1);
  assert.equal(research.candidates[0]?.candidateId, input.captureCandidateId);
  assert.equal(research.candidates[0]?.status, "candidate");
  assert.equal(
    await input.p0.latestPilotRun(
      input.accounts.capture.workspaceId,
      actor(input.accounts.capture),
    ),
    null,
  );
}

async function main(): Promise<void> {
  const summary = await seedUiEvaluation();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    process.stderr.write(
      `ui-evaluation-fixture: FAIL — ${safeUiEvaluationFailureMessage(error)}; no secrets were printed.\n`,
    );
    process.exitCode = 1;
  });
}
