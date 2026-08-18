begin;

create table order_private_address (
  workspace_id uuid not null references workspace(id),
  order_id uuid not null,
  ciphertext bytea not null check (octet_length(ciphertext) between 1 and 4096),
  nonce bytea not null check (octet_length(nonce) = 12),
  auth_tag bytea not null check (octet_length(auth_tag) = 16),
  key_version text not null check (char_length(key_version) between 1 and 40),
  created_by uuid not null references app_identity(id),
  created_at timestamptz not null default now(),
  primary key (workspace_id, order_id),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id)
);

create table address_access_lease (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  order_id uuid not null,
  identity_id uuid not null references app_identity(id),
  purpose text not null check (purpose = 'shipping_label'),
  issued_by uuid not null references app_identity(id),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (workspace_id, id),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id),
  check (expires_at > issued_at and expires_at <= issued_at + interval '5 minutes')
);

create index address_access_lease_active_lookup
on address_access_lease(workspace_id, order_id, identity_id, expires_at);

create table packing_evidence (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  order_id uuid not null,
  evidence_reference_id uuid not null,
  confirmed_by uuid not null references app_identity(id),
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, order_id),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id)
);

create table accounting_export (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  order_id uuid not null,
  sku_id uuid not null,
  filename text not null check (filename = 'journal-candidates.csv'),
  csv_sha256 text not null check (csv_sha256 ~ '^[a-f0-9]{64}$'),
  row_count integer not null check (row_count > 0),
  csv_content text not null,
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references app_identity(id),
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, idempotency_key),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id)
);

create table return_inspection (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  order_id uuid not null,
  inventory_unit_id uuid not null,
  resolution text not null check (resolution in ('restock', 'dispose')),
  confirmed_by uuid not null references app_identity(id),
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, order_id),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id),
  foreign key (workspace_id, inventory_unit_id) references inventory_unit(workspace_id, id)
);

create table order_operation_record (
  workspace_id uuid not null references workspace(id),
  order_id uuid not null,
  operation text not null check (operation in ('create', 'pick', 'pack', 'ship', 'return', 'quarantine', 'inspect')),
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  response_state text not null check (response_state in ('confirmed', 'picking', 'packed', 'shipped', 'returned')),
  response_inventory_status text not null check (response_inventory_status in ('reserved', 'picked', 'packed', 'shipped', 'quarantined', 'available', 'disposed')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, operation, idempotency_key),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id)
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'order_private_address', 'address_access_lease', 'packing_evidence',
    'accounting_export', 'return_inspection', 'order_operation_record'
  ] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('alter table %I force row level security', table_name);
    execute format(
      'create policy workspace_isolation on %I using (workspace_id = app_workspace_id()) with check (workspace_id = app_workspace_id())',
      table_name
    );
  end loop;
end $$;

grant select, insert on order_private_address, address_access_lease, packing_evidence,
  accounting_export, return_inspection, order_operation_record to resale_app_runtime;

alter table scan_session drop constraint scan_session_operation_check;
alter table scan_session add constraint scan_session_operation_check
  check (operation in ('putaway', 'move', 'pick', 'return_quarantine'));

create or replace function validate_scan_session() returns trigger
language plpgsql as $$
declare
  unit_row inventory_unit%rowtype;
  item_label inventory_label%rowtype;
  place_label inventory_label%rowtype;
  actor_role text;
begin
  if new.consumed_at is not null then
    raise exception 'a new scan session cannot already be consumed';
  end if;
  if new.confirmed_at < greatest(new.inventory_scanned_at, new.location_scanned_at) then
    raise exception 'human confirmation must follow both scans';
  end if;

  select * into unit_row from inventory_unit
  where workspace_id = new.workspace_id and id = new.inventory_unit_id;
  select * into item_label from inventory_label where id = new.inventory_label_id;
  select * into place_label from inventory_label where id = new.location_label_id;

  if item_label.id is null or item_label.workspace_id <> new.workspace_id
    or item_label.target_type <> 'inventory_unit'
    or item_label.target_id <> new.inventory_unit_id
    or not item_label.active
    or item_label.version <> new.inventory_label_version then
    raise exception 'inventory label is invalid, stale or outside the workspace';
  end if;
  if place_label.id is null or place_label.workspace_id <> new.workspace_id
    or place_label.target_type <> 'location'
    or place_label.target_id <> new.destination_location_id
    or not place_label.active
    or place_label.version <> new.location_label_version then
    raise exception 'location label is invalid, stale or outside the workspace';
  end if;
  if new.expected_location_id is distinct from unit_row.location_id then
    raise exception 'inventory current location changed; rescan is required';
  end if;

  select role into actor_role from workspace_membership
  where workspace_id = new.workspace_id and identity_id = new.confirmed_by and active;
  if actor_role is null
    or (new.operation in ('putaway', 'move') and actor_role not in ('owner', 'inventory_manager', 'field_worker'))
    or (new.operation in ('pick', 'return_quarantine') and actor_role not in ('owner', 'inventory_manager', 'shipping')) then
    raise exception 'actor role cannot confirm this scan operation';
  end if;

  if new.operation = 'putaway' and unit_row.status <> 'putaway_pending' then
    raise exception 'putaway requires a pending inventory unit';
  elsif new.operation = 'move' and unit_row.status <> 'available' then
    raise exception 'move requires available inventory';
  elsif new.operation = 'pick' and unit_row.status <> 'reserved' then
    raise exception 'pick requires reserved inventory';
  elsif new.operation = 'return_quarantine' and unit_row.status <> 'shipped' then
    raise exception 'return quarantine requires shipped inventory';
  end if;
  if new.operation = 'move' and new.destination_location_id = unit_row.location_id then
    raise exception 'move destination must differ from current location';
  elsif new.operation = 'pick' and new.destination_location_id <> unit_row.location_id then
    raise exception 'pick must confirm the current storage location';
  elsif new.operation = 'return_quarantine' and new.destination_location_id is null then
    raise exception 'return quarantine requires a destination';
  end if;
  return new;
end $$;

create or replace function finalize_inventory_movement() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  session_row public.scan_session%rowtype;
  unit_row public.inventory_unit%rowtype;
  item_label public.inventory_label%rowtype;
  place_label public.inventory_label%rowtype;
begin
  select * into session_row from public.scan_session
  where workspace_id = new.workspace_id and id = new.scan_session_id for update;
  select * into unit_row from public.inventory_unit
  where workspace_id = new.workspace_id and id = new.inventory_unit_id for update;
  select * into item_label from public.inventory_label
  where id = session_row.inventory_label_id for share;
  select * into place_label from public.inventory_label
  where id = session_row.location_label_id for share;

  if session_row.id is null or unit_row.id is null
    or session_row.inventory_unit_id <> new.inventory_unit_id
    or session_row.confirmed_by <> new.moved_by then
    raise exception 'movement does not match its confirmed scan session';
  end if;
  if session_row.consumed_at is not null then
    raise exception 'scan session was already consumed';
  end if;
  if session_row.expected_location_id is distinct from unit_row.location_id then
    raise exception 'inventory current location changed after scan; rescan is required';
  end if;
  if item_label.id is null or place_label.id is null
    or item_label.workspace_id <> new.workspace_id
    or item_label.target_type <> 'inventory_unit'
    or item_label.target_id <> new.inventory_unit_id
    or not item_label.active
    or item_label.version <> session_row.inventory_label_version
    or place_label.workspace_id <> new.workspace_id
    or place_label.target_type <> 'location'
    or place_label.target_id <> session_row.destination_location_id
    or not place_label.active
    or place_label.version <> session_row.location_label_version then
    raise exception 'movement scan labels became invalid or stale';
  end if;
  if new.moved_at < session_row.confirmed_at
    or new.moved_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'movement time is outside the confirmed scan window';
  end if;
  if new.movement_seq <> unit_row.movement_seq + 1
    or new.from_location_id is distinct from unit_row.location_id then
    raise exception 'inventory movement sequence or source location is stale';
  end if;
  if new.movement_kind <> session_row.operation then
    raise exception 'movement kind does not match scan operation';
  end if;
  if new.to_location_id is distinct from session_row.destination_location_id then
    raise exception 'movement destination does not match location scan';
  end if;

  update public.inventory_unit
  set location_id = new.to_location_id,
      status = case
        when new.movement_kind = 'pick' then 'picked'::public.inventory_status
        when new.movement_kind = 'return_quarantine' then 'quarantined'::public.inventory_status
        else 'available'::public.inventory_status
      end,
      movement_seq = new.movement_seq
  where workspace_id = new.workspace_id and id = new.inventory_unit_id;
  update public.scan_session
  set consumed_at = new.moved_at
  where workspace_id = new.workspace_id and id = new.scan_session_id;
  return new;
end $$;

create or replace function enforce_sales_order_transition() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  unit_id uuid;
  unit_status public.inventory_status;
begin
  if old.state = new.state then return new; end if;
  if not (
    (old.state = 'draft' and new.state in ('confirmed', 'cancelled'))
    or (old.state = 'confirmed' and new.state in ('picking', 'cancelled'))
    or (old.state = 'picking' and new.state in ('packed', 'cancelled'))
    or (old.state = 'packed' and new.state in ('shipped', 'cancelled'))
    or (old.state = 'shipped' and new.state = 'returned')
  ) then
    raise exception 'sales order transition is not allowed';
  end if;

  select allocation.inventory_unit_id, unit.status
  into unit_id, unit_status
  from public.order_allocation allocation
  join public.inventory_unit unit
    on unit.workspace_id = allocation.workspace_id and unit.id = allocation.inventory_unit_id
  where allocation.workspace_id = new.workspace_id and allocation.order_id = new.id
    and allocation.active
  for update of unit;

  if new.state in ('picking', 'packed', 'shipped', 'returned') and unit_id is null then
    raise exception 'sales order requires an active allocation';
  end if;
  if new.state = 'picking' and unit_status <> 'picked' then
    raise exception 'picking state requires a confirmed pick scan';
  elsif new.state = 'packed' then
    if unit_status <> 'picked' or not exists (
      select 1 from public.packing_evidence evidence
      where evidence.workspace_id = new.workspace_id and evidence.order_id = new.id
    ) then
      raise exception 'packed state requires picked inventory and packing evidence';
    end if;
    update public.inventory_unit set status = 'packed'
    where workspace_id = new.workspace_id and id = unit_id;
  elsif new.state = 'shipped' then
    if unit_status <> 'packed' then raise exception 'shipped state requires packed inventory'; end if;
    update public.inventory_unit set status = 'shipped', location_id = null
    where workspace_id = new.workspace_id and id = unit_id;
  elsif new.state = 'returned' and unit_status <> 'shipped' then
    raise exception 'returned order requires shipped inventory';
  end if;
  return new;
end $$;

revoke all on function enforce_sales_order_transition() from public;
create trigger sales_order_transition_guard
before update of state on sales_order
for each row execute function enforce_sales_order_transition();

create or replace function apply_return_inspection() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  unit_status public.inventory_status;
  order_state text;
begin
  select status into unit_status from public.inventory_unit
  where workspace_id = new.workspace_id and id = new.inventory_unit_id for update;
  select state into order_state from public.sales_order
  where workspace_id = new.workspace_id and id = new.order_id;
  if unit_status <> 'quarantined' or order_state <> 'returned' then
    raise exception 'return inspection requires quarantined inventory and returned order';
  end if;
  update public.inventory_unit
  set status = case when new.resolution = 'restock' then 'available'::public.inventory_status
                    else 'disposed'::public.inventory_status end,
      location_id = case when new.resolution = 'restock' then location_id else null end
  where workspace_id = new.workspace_id and id = new.inventory_unit_id;
  return new;
end $$;

revoke all on function apply_return_inspection() from public;
create trigger return_inspection_guard
after insert on return_inspection
for each row execute function apply_return_inspection();

revoke update on order_private_address, packing_evidence, accounting_export, return_inspection,
  order_operation_record
from resale_app_runtime;

commit;
