begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'resale_app_runtime') then
    create role resale_app_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;

grant usage on schema public to resale_app_runtime;
grant execute on function app_workspace_id() to resale_app_runtime;

grant select on workspace_membership to resale_app_runtime;
grant select, insert, update on
  product_sku, location_node, inventory_unit, inventory_label, location_photo,
  scan_session, inventory_movement, count_session, count_observation,
  inventory_discrepancy, sales_order, order_allocation, financial_event,
  idempotency_record, outbox_event, p0_workflow, p0_workflow_action,
  media_asset, measurement_attempt
to resale_app_runtime;
grant select, insert on audit_event to resale_app_runtime;

grant select on auth_credential to resale_app_runtime;
grant select, insert, update, delete on auth_login_bucket to resale_app_runtime;
grant select, insert, update on auth_session to resale_app_runtime;

comment on role resale_app_runtime is
  'NOLOGIN capability role for the API. A separate LOGIN role must be granted this role; SUPERUSER and BYPASSRLS are forbidden.';

commit;
