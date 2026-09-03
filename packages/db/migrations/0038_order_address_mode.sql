begin;

-- Existing rows deliberately remain NULL. Every read in this migration treats
-- NULL as stored, preserving the legacy meaning without rewriting history.
alter table sales_order
  add column address_mode text
  constraint sales_order_address_mode_check
  check (address_mode is null or address_mode in ('anonymous', 'stored'));

alter table sales_order alter column address_mode set default 'stored';

create or replace function reject_order_address_mode_change() returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.address_mode is distinct from new.address_mode then
    raise exception 'order address mode is immutable'
      using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger sales_order_address_mode_immutable
before update of address_mode on sales_order
for each row execute function reject_order_address_mode_change();

create or replace function validate_new_order_address_storage() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  private_address_count integer;
begin
  -- The trigger is deferred so the application may create the order first and
  -- its encrypted row second in one atomic transaction.
  select count(*)::integer into private_address_count
  from public.order_private_address address_row
  where address_row.workspace_id = new.workspace_id
    and address_row.order_id = new.id;

  if coalesce(new.address_mode, 'stored') = 'anonymous' and private_address_count <> 0 then
    raise exception 'anonymous orders cannot store a private address'
      using errcode = '23514';
  elsif coalesce(new.address_mode, 'stored') = 'stored' and private_address_count <> 1 then
    raise exception 'stored-address orders require exactly one private address'
      using errcode = '23514';
  end if;
  return null;
end
$$;

create constraint trigger new_order_address_storage_guard
after insert on sales_order
deferrable initially deferred
for each row execute function validate_new_order_address_storage();

create or replace function validate_private_address_mode() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1
    from public.sales_order orders
    where orders.workspace_id = new.workspace_id
      and orders.id = new.order_id
      and coalesce(orders.address_mode, 'stored') = 'stored'
  ) then
    raise exception 'private addresses are allowed only for stored-address orders'
      using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger order_private_address_mode_guard
before insert or update on order_private_address
for each row execute function validate_private_address_mode();

create or replace function validate_address_access_lease_mode() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := public.app_identity_id();
begin
  if actor_id is null
    or new.workspace_id is distinct from public.app_workspace_id()
    or new.identity_id is distinct from actor_id
    or new.issued_by is distinct from actor_id
    or not public.can_actor_access_shipping_order(new.order_id) then
    raise exception 'the session actor cannot create this address lease'
      using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.sales_order orders
    join public.order_private_address address_row
      on address_row.workspace_id = orders.workspace_id
     and address_row.order_id = orders.id
    where orders.workspace_id = new.workspace_id
      and orders.id = new.order_id
      and coalesce(orders.address_mode, 'stored') = 'stored'
  ) then
    raise exception 'address leases require a stored private address'
      using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger address_access_lease_mode_guard
before insert or update on address_access_lease
for each row execute function validate_address_access_lease_mode();

create or replace function order_has_current_actor_address_lease(
  target_workspace_id uuid,
  target_order_id uuid
) returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.address_access_lease lease
    where lease.workspace_id = target_workspace_id
      and lease.order_id = target_order_id
      and lease.identity_id = public.app_identity_id()
      and lease.issued_by = public.app_identity_id()
      and lease.issued_at <= statement_timestamp()
      and lease.expires_at > statement_timestamp()
  )
$$;

create or replace function require_address_lease_for_order_work() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if old.state is distinct from new.state
    and new.state in ('picking', 'packed', 'shipped')
    and coalesce(new.address_mode, 'stored') = 'stored'
    and (
      not exists (
        select 1 from public.order_private_address address_row
        where address_row.workspace_id = new.workspace_id
          and address_row.order_id = new.id
      )
      or not public.order_has_current_actor_address_lease(new.workspace_id, new.id)
    ) then
    raise exception 'stored-address order work requires the current actor address lease'
      using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger sales_order_address_lease_guard
before update of state on sales_order
for each row execute function require_address_lease_for_order_work();

create or replace function require_address_lease_for_order_evidence() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
    from public.sales_order orders
    where orders.workspace_id = new.workspace_id
      and orders.id = new.order_id
      and coalesce(orders.address_mode, 'stored') = 'stored'
  ) and not public.order_has_current_actor_address_lease(new.workspace_id, new.order_id) then
    raise exception 'stored-address order evidence requires the current actor address lease'
      using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger packing_address_lease_guard
before insert on packing_evidence
for each row execute function require_address_lease_for_order_evidence();

create trigger shipment_address_lease_guard
before insert on shipment_human_confirmation
for each row execute function require_address_lease_for_order_evidence();

drop policy if exists workspace_isolation on order_private_address;
create policy private_address_minimized_access on order_private_address
using (
  workspace_id = app_workspace_id()
  and can_actor_access_shipping_order(order_id)
  and exists (
    select 1 from address_access_lease lease
    where lease.workspace_id = order_private_address.workspace_id
      and lease.order_id = order_private_address.order_id
      and lease.identity_id = app_identity_id()
      and lease.issued_by = app_identity_id()
      and lease.issued_at <= statement_timestamp()
      and lease.expires_at > statement_timestamp()
  )
)
with check (
  workspace_id = app_workspace_id()
  and exists (
    select 1 from workspace_membership membership
    where membership.workspace_id = order_private_address.workspace_id
      and membership.identity_id = app_identity_id()
      and membership.active
      and membership.role in ('owner', 'inventory_manager')
  )
  and exists (
    select 1 from sales_order orders
    where orders.workspace_id = order_private_address.workspace_id
      and orders.id = order_private_address.order_id
      and coalesce(orders.address_mode, 'stored') = 'stored'
  )
);

drop policy if exists workspace_isolation on address_access_lease;
create policy address_lease_own_access on address_access_lease
using (
  workspace_id = app_workspace_id()
  and identity_id = app_identity_id()
  and issued_by = app_identity_id()
  and can_actor_access_shipping_order(order_id)
  and exists (
    select 1 from sales_order orders
    where orders.workspace_id = address_access_lease.workspace_id
      and orders.id = address_access_lease.order_id
      and coalesce(orders.address_mode, 'stored') = 'stored'
  )
)
with check (
  workspace_id = app_workspace_id()
  and identity_id = app_identity_id()
  and issued_by = app_identity_id()
  and can_actor_access_shipping_order(order_id)
  and exists (
    select 1 from sales_order orders
    where orders.workspace_id = address_access_lease.workspace_id
      and orders.id = address_access_lease.order_id
      and coalesce(orders.address_mode, 'stored') = 'stored'
  )
);

revoke update, delete on order_private_address, address_access_lease from resale_app_runtime;

revoke all on function reject_order_address_mode_change() from public;
revoke all on function validate_new_order_address_storage() from public;
revoke all on function validate_private_address_mode() from public;
revoke all on function validate_address_access_lease_mode() from public;
revoke all on function order_has_current_actor_address_lease(uuid, uuid) from public;
revoke all on function require_address_lease_for_order_work() from public;
revoke all on function require_address_lease_for_order_evidence() from public;

commit;
