import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../../../packages/db/migrations/0037_order_registration_shipping_method.sql",
  import.meta.url,
);
const addressModeMigrationUrl = new URL(
  "../../../packages/db/migrations/0038_order_address_mode.sql",
  import.meta.url,
);
const missingFinancialFactsMigrationUrl = new URL(
  "../../../packages/db/migrations/0039_registered_order_missing_financial_facts.sql",
  import.meta.url,
);
const repositoryUrl = new URL("./order-repository.ts", import.meta.url);

describe("P14 order registration and shipping database contract", () => {
  it("keeps order numbering, revision chains, idempotency and shipment evidence in the database", async () => {
    const sql = await readFile(migrationUrl, "utf8");

    expect(sql).toContain("create or replace function issue_app_order_number()");
    expect(sql).toContain("on conflict (workspace_id, business_date) do update");
    expect(sql).toContain("unique (workspace_id, order_id, revision)");
    expect(sql).toContain("unique (workspace_id, order_id, idempotency_key)");
    expect(sql).toContain("shipping_method_catalog_one_successor");
    expect(sql).toContain("order_shipping_method_one_successor");
    expect(sql).toContain("shipment_p14_fields_all_or_none");
    expect(sql).toContain("shipping_financial_event_id");
    expect(sql).toContain("financial_event_p14_shipping_contract_guard");
    expect(sql).toContain(
      "registered shipment cannot adopt a pre-existing shipping financial fact",
    );
    expect(sql).toContain("pg_trigger_depth() <> 2");
    expect(sql).toContain("for update");
    expect(sql).toContain("current_selection.selected_fee_minor");
    expect(sql).toContain("order_shipping_readiness_confirmation_is_current");
    expect(sql).toContain("create or replace function record_order_shipping_method_selection(");
    expect(sql).toContain(
      "grant execute on function record_order_shipping_method_selection(uuid, uuid, integer, uuid, text)",
    );
    expect(sql).toContain("order_registration_revision_append_only");
    expect(sql).toContain("order_channel_transaction_claim_append_only");
    expect(sql).toContain("primary key (workspace_id, sales_channel_key, channel_transaction_id)");
    expect(sql).toContain(
      "revoke all on order_number_counter, order_channel_transaction_claim from resale_app_runtime",
    );
    expect(sql).toContain("order_shipping_readiness_confirmation_append_only");
    expect(sql).toContain("audit_p14_order_contract_change");
  });

  it("never sends placeholder registration, catalog or fee values from the API", async () => {
    const repository = await readFile(repositoryUrl, "utf8");
    expect(repository).toContain("select record_order_shipping_method_selection(");
    expect(repository).toContain("from record_order_shipping_readiness_confirmation(");
    expect(repository).toContain("confirmation.confirmation_id");
    expect(repository).not.toContain("${randomUUID()}, ${input.methodId}, ${randomUUID()}, 0");
    expect(repository).not.toContain('${"0".repeat(64)}');

    const assignment = repository.slice(
      repository.indexOf("async assignShipping("),
      repository.indexOf("async shippingTasks("),
    );
    expect(assignment).not.toContain("address_mode");
    expect(assignment).not.toContain("order_private_address");
  });

  it("minimizes anonymous address data while preserving legacy NULL as immutable stored mode", async () => {
    const sql = await readFile(addressModeMigrationUrl, "utf8");

    expect(sql).toContain("add column address_mode text");
    expect(sql).toContain("alter table sales_order alter column address_mode set default 'stored'");
    expect(sql).not.toMatch(/update\s+sales_order\s+set\s+address_mode/iu);
    expect(sql).toContain("coalesce(new.address_mode, 'stored')");
    expect(sql).toContain("sales_order_address_mode_immutable");
    expect(sql).toContain("deferrable initially deferred");
    expect(sql).toContain("anonymous orders cannot store a private address");
    expect(sql).toContain("stored-address orders require exactly one private address");
    expect(sql).toContain("address leases require a stored private address");
    expect(sql).toContain("lease.identity_id = public.app_identity_id()");
    expect(sql).toContain("lease.issued_by = public.app_identity_id()");
    expect(sql).toContain("new.state in ('picking', 'packed', 'shipped')");
    expect(sql).toContain("packing_address_lease_guard");
    expect(sql).toContain("shipment_address_lease_guard");
    expect(sql).toContain("private_address_minimized_access");
    expect(sql).toContain("address_lease_own_access");
  });

  it("ships registered orders without fabricating missing fee facts", async () => {
    const sql = await readFile(missingFinancialFactsMigrationUrl, "utf8");

    expect(sql).toContain("cost_fact_count <> 1");
    expect(sql).toContain("sale_fact_count > 1");
    expect(sql).toContain("fee_fact_count > 1");
    expect(sql).toContain("packaging_fact_count > 1");
    expect(sql).not.toContain("fee_fact_count <> 1");
    expect(sql).not.toContain("packaging_fact_count <> 1");
    expect(sql).toContain("distinct_tax_basis_count <> 1");
    expect(sql).toContain("mismatched_sku_count <> 0");
    expect(sql.match(/insert into public\.financial_event/gu)).toHaveLength(1);
    expect(sql).toContain("new.order_id, 'shipping'");
  });

  it("forces workspace RLS and keeps assigned-shipping reads on minimal security-definer views", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    for (const table of [
      "order_number_counter",
      "order_registration_revision",
      "order_channel_transaction_claim",
      "shipping_method_catalog_revision",
      "order_shipping_method_selection",
      "order_shipping_readiness_confirmation",
    ]) {
      expect(sql).toContain(`alter table ${table} force row level security`);
    }
    expect(sql).toContain("can_actor_access_shipping_order(new.order_id)");
    expect(sql).toContain("current_actor_shipping_method_options(target_order_id uuid)");
    expect(sql).toContain("current_actor_order_shipping_context(target_order_id uuid)");

    const minimalContext = sql.slice(
      sql.indexOf("create or replace function current_actor_order_shipping_context"),
      sql.indexOf("create or replace function validate_shipment_human_confirmation"),
    );
    for (const forbidden of [
      "buyer_display_name",
      "cost_amount",
      "profit",
      "tax_basis",
      "changed_by",
      "selected_by",
      "confirmed_by",
      "official_reference_url",
      "official_reference_note",
    ]) {
      expect(minimalContext).not.toContain(forbidden);
    }
    expect(minimalContext).toContain("channel_transaction_id_status");
    expect(minimalContext).toContain("selected_fee_minor");
    expect(minimalContext).toContain("official_checked_on");
  });

  it("allows management to read the current location derivative without weakening shipping assignment checks", async () => {
    const repository = await readFile(repositoryUrl, "utf8");
    const locationPhotoRead = repository.slice(
      repository.indexOf("async readAssignedLocationPhoto("),
      repository.indexOf("async orderRegistration("),
    );

    expect(locationPhotoRead).toContain("join workspace_membership membership");
    expect(locationPhotoRead).toContain("membership.active");
    expect(locationPhotoRead).toContain("membership.role in ('owner', 'inventory_manager')");
    expect(locationPhotoRead).toContain("membership.role = 'shipping'");
    expect(locationPhotoRead).not.toContain("join order_assignment assignment");
    expect(locationPhotoRead).toContain("from order_assignment assignment");
    expect(locationPhotoRead).toContain("assignment.identity_id = membership.identity_id");
    expect(locationPhotoRead).toContain("assignment.revoked_at is null");
    expect(locationPhotoRead).toContain("assignment.starts_at <= statement_timestamp()");
    expect(locationPhotoRead).toContain("assignment.expires_at > statement_timestamp()");
    expect(locationPhotoRead).toContain("allocation.active");
    expect(locationPhotoRead).toContain("unit.movement_seq = ${movementSequence}");
    expect(locationPhotoRead).toContain("location_photo.review_state = 'approved'");
    expect(locationPhotoRead).toContain("location_photo.gps_exif_count = 0");
    expect(locationPhotoRead).toContain(
      "order by location_photo.reviewed_at desc, location_photo.id desc",
    );
  });

  it("contains no external network, scraping, RPA or automatic-confirmation mechanism", async () => {
    const sql = `${await readFile(migrationUrl, "utf8")}\n${await readFile(
      addressModeMigrationUrl,
      "utf8",
    )}\n${await readFile(missingFinancialFactsMigrationUrl, "utf8")}`.toLowerCase();
    expect(sql).not.toMatch(/\bhttp_get\b|\bhttp_post\b|\bcurl\b|\bscrap(?:e|ing)\b|\brpa\b/u);
    expect(sql).not.toContain("auto_confirm");
  });
});
