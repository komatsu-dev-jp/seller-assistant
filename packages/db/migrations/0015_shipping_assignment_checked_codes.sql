begin;

create extension if not exists btree_gist;

create or replace function app_code_check_digit(base_code text) returns integer
language sql immutable strict as $$
  select mod(sum(
    ascii(substr(upper(base_code), position, 1)) *
    case when mod(length(base_code) - position, 2) = 0 then 3 else 1 end
  ), 10)::integer
  from generate_series(1, length(base_code)) as position
$$;

create or replace function app_append_code_check_digit(base_code text) returns text
language sql immutable strict as $$
  select upper(btrim(base_code)) || '-' || app_code_check_digit(upper(btrim(base_code)))::text
$$;

create or replace function app_has_valid_code_check_digit(code text) returns boolean
language sql immutable strict as $$
  select case
    when code ~ '-[0-9]$'
      then right(code, 1)::integer = app_code_check_digit(left(code, length(code) - 2))
    else false
  end
$$;

-- Existing rows still satisfy the legacy INV-000001 constraint here. Drop that
-- constraint before converting them to INV-000001-7 so an in-place upgrade can
-- complete without a transient CHECK violation.
alter table inventory_unit drop constraint inventory_unit_inventory_number_check;

update inventory_unit
set inventory_number = app_append_code_check_digit(inventory_number)
where not app_has_valid_code_check_digit(inventory_number);

update location_node
set code = app_append_code_check_digit(code)
where not app_has_valid_code_check_digit(code);

-- The pre-existing guard correctly treats an issued label code as immutable.
-- This one-time, transactional data migration is the only exception: it keeps
-- the same target, token and version while adding the check digit required by
-- the new scanner contract. A failure rolls the trigger state back with the
-- surrounding transaction.
alter table inventory_label disable trigger inventory_label_target_guard;

update inventory_label label
set short_code = unit.inventory_number
from inventory_unit unit
where label.workspace_id = unit.workspace_id
  and label.target_type = 'inventory_unit'
  and label.target_id = unit.id;

update inventory_label label
set short_code = location.code
from location_node location
where label.workspace_id = location.workspace_id
  and label.target_type = 'location'
  and label.target_id = location.id;

alter table inventory_label enable trigger inventory_label_target_guard;

alter table inventory_unit add constraint inventory_unit_inventory_number_check
  check (inventory_number ~ '^INV-[0-9]{6}-[0-9]$' and app_has_valid_code_check_digit(inventory_number));

alter table location_node add constraint location_node_code_check
  check (
    code ~ '^[A-Z0-9]+(-[A-Z0-9]+)+-[0-9]$'
    and app_has_valid_code_check_digit(code)
  );

create table order_assignment (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  order_id uuid not null,
  identity_id uuid not null references app_identity(id),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  assigned_by uuid not null references app_identity(id),
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id),
  check (expires_at > starts_at and expires_at <= starts_at + interval '24 hours'),
  check (revoked_at is null or revoked_at >= starts_at)
);

create index order_assignment_active_lookup
on order_assignment(workspace_id, order_id, identity_id, starts_at, expires_at)
where revoked_at is null;

alter table order_assignment add constraint order_assignment_no_overlap
exclude using gist (
  workspace_id with =,
  order_id with =,
  tstzrange(starts_at, expires_at, '[)') with &&
)
where (revoked_at is null);

alter table order_assignment enable row level security;
alter table order_assignment force row level security;
create policy workspace_isolation on order_assignment
using (workspace_id = app_workspace_id())
with check (workspace_id = app_workspace_id());

grant select, insert on order_assignment to resale_app_runtime;

commit;
