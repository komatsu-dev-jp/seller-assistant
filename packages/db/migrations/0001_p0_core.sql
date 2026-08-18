begin;

create extension if not exists pgcrypto;

create type inventory_status as enum (
  'putaway_pending', 'available', 'reserved', 'picked', 'packed',
  'shipped', 'quarantined', 'lost', 'disposed'
);
create type location_state as enum ('active', 'inactive', 'retired');
create type approval_state as enum ('draft', 'pending', 'approved', 'rejected', 'changes_requested');

create table workspace (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table app_identity (
  id uuid primary key,
  display_name text not null check (char_length(display_name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table workspace_membership (
  workspace_id uuid not null references workspace(id),
  identity_id uuid not null references app_identity(id),
  role text not null check (role in ('owner', 'inventory_manager', 'field_worker', 'shipping', 'accounting')),
  active boolean not null default true,
  primary key (workspace_id, identity_id)
);

create table product_sku (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  sku_code text not null,
  title text not null default '',
  category text,
  human_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, sku_code)
);

create table location_node (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  parent_id uuid,
  code text not null,
  name text not null,
  depth smallint not null check (depth between 0 and 7),
  state location_state not null default 'active',
  can_store_inventory boolean not null default false,
  single_item_only boolean not null default false,
  allow_mixed_sku boolean not null default true,
  max_units integer check (max_units is null or max_units > 0),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, code),
  foreign key (workspace_id, parent_id) references location_node(workspace_id, id)
);

create or replace function prevent_location_cycle() returns trigger
language plpgsql as $$
declare
  found_cycle boolean;
  expected_depth integer;
begin
  if new.parent_id is null then
    if new.depth <> 0 then raise exception 'root location depth must be zero'; end if;
    return new;
  end if;

  select depth + 1 into expected_depth
  from location_node
  where workspace_id = new.workspace_id and id = new.parent_id;
  if expected_depth is null or new.depth <> expected_depth or expected_depth > 7 then
    raise exception 'invalid location depth or parent';
  end if;

  with recursive ancestors(id, parent_id) as (
    select id, parent_id from location_node
    where workspace_id = new.workspace_id and id = new.parent_id
    union all
    select parent.id, parent.parent_id
    from location_node parent
    join ancestors child on child.parent_id = parent.id
    where parent.workspace_id = new.workspace_id
  )
  select exists(select 1 from ancestors where id = new.id) into found_cycle;
  if found_cycle then raise exception 'location cycle is forbidden'; end if;
  return new;
end $$;

create trigger location_cycle_guard
before insert or update of parent_id, depth on location_node
for each row execute function prevent_location_cycle();

create table inventory_unit (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  sku_id uuid not null,
  inventory_number text not null check (inventory_number ~ '^INV-[0-9]{6}$'),
  status inventory_status not null default 'putaway_pending',
  location_id uuid,
  movement_seq bigint not null default 0 check (movement_seq >= 0),
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, inventory_number),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id),
  foreign key (workspace_id, location_id) references location_node(workspace_id, id),
  check (
    (status in ('available', 'reserved', 'picked', 'packed') and location_id is not null)
    or (status not in ('available', 'reserved', 'picked', 'packed'))
  )
);

create or replace function enforce_inventory_location() returns trigger
language plpgsql as $$
declare
  destination location_node%rowtype;
  occupied_count integer;
  different_sku_count integer;
begin
  if new.location_id is null then return new; end if;
  select * into destination from location_node
  where workspace_id = new.workspace_id and id = new.location_id for update;
  if not found or destination.state <> 'active' or not destination.can_store_inventory then
    raise exception 'destination cannot store inventory';
  end if;
  select count(*), count(*) filter (where sku_id <> new.sku_id)
  into occupied_count, different_sku_count
  from inventory_unit
  where workspace_id = new.workspace_id and location_id = new.location_id and id <> new.id
    and status not in ('shipped', 'lost', 'disposed');
  if destination.single_item_only and occupied_count > 0 then
    raise exception 'single item location is occupied';
  end if;
  if destination.max_units is not null and occupied_count >= destination.max_units then
    raise exception 'location capacity reached';
  end if;
  if not destination.allow_mixed_sku and different_sku_count > 0 then
    raise exception 'mixed SKU location is forbidden';
  end if;
  return new;
end $$;

create trigger inventory_location_guard
before insert or update of location_id, status on inventory_unit
for each row execute function enforce_inventory_location();

create table inventory_label (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  target_type text not null check (target_type in ('inventory_unit', 'location')),
  target_id uuid not null,
  label_kind text not null check (label_kind in ('qr', 'manual_code')),
  version integer not null check (version > 0),
  token_hash text not null unique check (char_length(token_hash) = 64),
  short_code text not null,
  active boolean not null default true,
  issued_by uuid not null references app_identity(id),
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (workspace_id, short_code, active)
);

create unique index one_active_label_per_target
on inventory_label(workspace_id, target_type, target_id, label_kind)
where active;

create table location_photo (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  location_id uuid not null,
  photo_kind text not null check (photo_kind in ('room', 'shelf', 'exact_position')),
  original_asset_id uuid not null,
  derivative_asset_id uuid,
  review_state approval_state not null default 'pending',
  gps_exif_count integer not null default 0 check (gps_exif_count = 0),
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, location_id) references location_node(workspace_id, id),
  check (review_state = 'approved' or derivative_asset_id is null)
);

create table scan_session (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  operation text not null check (operation in ('putaway', 'move', 'pick')),
  inventory_unit_id uuid not null,
  expected_location_id uuid,
  destination_location_id uuid not null,
  inventory_label_id uuid not null references inventory_label(id),
  inventory_label_version integer not null,
  location_label_id uuid not null references inventory_label(id),
  location_label_version integer not null,
  inventory_scanned_at timestamptz not null,
  location_scanned_at timestamptz not null,
  confirmed_by uuid not null references app_identity(id),
  confirmed_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, inventory_unit_id) references inventory_unit(workspace_id, id),
  foreign key (workspace_id, expected_location_id) references location_node(workspace_id, id),
  foreign key (workspace_id, destination_location_id) references location_node(workspace_id, id)
);

create table inventory_movement (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  inventory_unit_id uuid not null,
  movement_seq bigint not null,
  from_location_id uuid,
  to_location_id uuid,
  movement_kind text not null check (movement_kind in ('putaway', 'move', 'pick', 'return_quarantine')),
  scan_session_id uuid not null,
  idempotency_key text not null,
  payload_hash text not null check (char_length(payload_hash) = 64),
  moved_by uuid not null references app_identity(id),
  moved_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, inventory_unit_id, movement_seq),
  unique (workspace_id, idempotency_key),
  unique (workspace_id, scan_session_id),
  foreign key (workspace_id, inventory_unit_id) references inventory_unit(workspace_id, id),
  foreign key (workspace_id, scan_session_id) references scan_session(workspace_id, id),
  foreign key (workspace_id, from_location_id) references location_node(workspace_id, id),
  foreign key (workspace_id, to_location_id) references location_node(workspace_id, id)
);

create table count_session (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  location_id uuid not null,
  state text not null check (state in ('draft', 'counting', 'reconciliation', 'approved')),
  basis_movement_seq bigint not null,
  initial_counter_id uuid not null references app_identity(id),
  started_at timestamptz,
  approved_by uuid references app_identity(id),
  approved_at timestamptz,
  primary key (workspace_id, id),
  foreign key (workspace_id, location_id) references location_node(workspace_id, id),
  check (approved_by is null or approved_by <> initial_counter_id)
);

create table count_observation (
  workspace_id uuid not null,
  count_session_id uuid not null,
  ordinal integer not null check (ordinal > 0),
  inventory_unit_id uuid,
  observed_label_id uuid references inventory_label(id),
  observed_by uuid not null references app_identity(id),
  observed_at timestamptz not null,
  result text not null check (result in ('matched', 'misplaced', 'unexpected', 'duplicate', 'unreadable')),
  primary key (workspace_id, count_session_id, ordinal),
  foreign key (workspace_id, count_session_id) references count_session(workspace_id, id),
  foreign key (workspace_id, inventory_unit_id) references inventory_unit(workspace_id, id)
);

create table inventory_discrepancy (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  count_session_id uuid not null,
  inventory_unit_id uuid,
  kind text not null check (kind in ('missing_candidate', 'misplaced', 'unexpected', 'duplicate', 'unreadable')),
  state text not null check (state in ('open', 'reconfirmation_required', 'approval_required', 'resolved')),
  requester_id uuid not null references app_identity(id),
  reconfirmer_id uuid references app_identity(id),
  approver_id uuid references app_identity(id),
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (workspace_id, id),
  foreign key (workspace_id, count_session_id) references count_session(workspace_id, id),
  foreign key (workspace_id, inventory_unit_id) references inventory_unit(workspace_id, id),
  check (reconfirmer_id is null or reconfirmer_id <> requester_id),
  check (approver_id is null or approver_id <> requester_id),
  check (state <> 'resolved' or (reconfirmer_id is not null and approver_id is not null and resolution is not null))
);

create table sales_order (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  order_number text not null,
  state text not null check (state in ('draft', 'confirmed', 'picking', 'packed', 'shipped', 'cancelled', 'returned')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, order_number)
);

create table order_allocation (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  order_id uuid not null,
  inventory_unit_id uuid not null,
  active boolean not null default true,
  allocated_at timestamptz not null default now(),
  released_at timestamptz,
  primary key (workspace_id, id),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id),
  foreign key (workspace_id, inventory_unit_id) references inventory_unit(workspace_id, id)
);

create unique index one_active_order_per_inventory_unit
on order_allocation(workspace_id, inventory_unit_id)
where active;

create table financial_event (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  sku_id uuid,
  order_id uuid,
  event_type text not null check (event_type in ('sale', 'refund', 'fee', 'fee_reversal', 'shipping', 'packaging', 'cost')),
  amount_minor bigint not null,
  currency char(3) not null default 'JPY',
  tax_basis text not null check (tax_basis in ('tax_included', 'tax_excluded', 'unknown')),
  bearer text not null check (bearer in ('seller', 'channel', 'buyer', 'unknown')),
  source text not null,
  source_meaning text not null,
  rounding_rule_version text not null,
  reverses_event_id uuid,
  source_already_net boolean not null default false,
  occurred_at timestamptz not null,
  primary key (workspace_id, id),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id),
  foreign key (workspace_id, reverses_event_id) references financial_event(workspace_id, id),
  check (currency <> 'JPY' or amount_minor = trunc(amount_minor))
);

create unique index one_successful_reversal_per_event
on financial_event(workspace_id, reverses_event_id)
where reverses_event_id is not null;

create table idempotency_record (
  workspace_id uuid not null references workspace(id),
  operation text not null,
  idempotency_key text not null,
  payload_hash text not null check (char_length(payload_hash) = 64),
  result_reference_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, operation, idempotency_key)
);

create table audit_event (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  actor_id uuid not null references app_identity(id),
  action text not null,
  target_type text not null,
  target_id uuid not null,
  occurred_at timestamptz not null default now(),
  field_names text[] not null default '{}',
  redacted_changes jsonb not null default '{}',
  reference_ids uuid[] not null default '{}',
  primary key (workspace_id, id),
  check (jsonb_typeof(redacted_changes) = 'object'),
  check (not (field_names && array['address','postalCode','token','cookie','receiptBody','aiPrompt','aiResponse','password','secret']::text[])),
  check (not (redacted_changes ?| array['address','postalCode','token','cookie','receiptBody','aiPrompt','aiResponse','password','secret']))
);

create table outbox_event (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null,
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  delivered_at timestamptz,
  primary key (workspace_id, id)
);

create or replace function app_workspace_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.workspace_id', true), '')::uuid
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'workspace_membership', 'product_sku', 'location_node', 'inventory_unit',
    'inventory_label', 'location_photo', 'scan_session', 'inventory_movement',
    'count_session', 'count_observation', 'inventory_discrepancy', 'sales_order',
    'order_allocation', 'financial_event', 'idempotency_record', 'audit_event', 'outbox_event'
  ] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('alter table %I force row level security', table_name);
    execute format(
      'create policy workspace_isolation on %I using (workspace_id = app_workspace_id()) with check (workspace_id = app_workspace_id())',
      table_name
    );
  end loop;
end $$;

commit;
