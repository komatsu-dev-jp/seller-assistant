begin;

create or replace function validate_inventory_unit_entry() returns trigger
language plpgsql as $$
begin
  if new.status <> 'putaway_pending' or new.location_id is not null or new.movement_seq <> 0 then
    raise exception 'inventory units must enter as putaway_pending without a location';
  end if;
  return new;
end $$;

create trigger inventory_unit_entry_guard
before insert on inventory_unit
for each row execute function validate_inventory_unit_entry();

create or replace function validate_inventory_label_target() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if old.target_type is distinct from new.target_type
      or old.target_id is distinct from new.target_id
      or old.label_kind is distinct from new.label_kind
      or old.version is distinct from new.version
      or old.token_hash is distinct from new.token_hash
      or old.short_code is distinct from new.short_code then
      raise exception 'issued label identity is immutable';
    end if;
    if not old.active and new.active then
      raise exception 'revoked labels cannot be reactivated';
    end if;
  end if;

  if (new.active and new.revoked_at is not null) or (not new.active and new.revoked_at is null) then
    raise exception 'label active and revoked state disagree';
  end if;

  if new.target_type = 'inventory_unit' then
    perform 1 from inventory_unit
    where workspace_id = new.workspace_id and id = new.target_id;
  else
    perform 1 from location_node
    where workspace_id = new.workspace_id and id = new.target_id;
  end if;
  if not found then
    raise exception 'label target is outside the workspace or missing';
  end if;
  return new;
end $$;

create trigger inventory_label_target_guard
before insert or update on inventory_label
for each row execute function validate_inventory_label_target();

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
    or (new.operation = 'pick' and actor_role not in ('owner', 'inventory_manager', 'shipping')) then
    raise exception 'actor role cannot confirm this scan operation';
  end if;

  if new.operation = 'putaway' and unit_row.status <> 'putaway_pending' then
    raise exception 'putaway requires a pending inventory unit';
  elsif new.operation = 'move' and unit_row.status <> 'available' then
    raise exception 'move requires available inventory';
  elsif new.operation = 'pick' and unit_row.status <> 'reserved' then
    raise exception 'pick requires reserved inventory';
  end if;
  if new.operation = 'move' and new.destination_location_id = unit_row.location_id then
    raise exception 'move destination must differ from current location';
  elsif new.operation = 'pick' and new.destination_location_id <> unit_row.location_id then
    raise exception 'pick must confirm the current storage location';
  end if;
  return new;
end $$;

create trigger scan_session_guard
before insert on scan_session
for each row execute function validate_scan_session();

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
      status = case when new.movement_kind = 'pick' then 'picked'::public.inventory_status
                    else 'available'::public.inventory_status end,
      movement_seq = new.movement_seq
  where workspace_id = new.workspace_id and id = new.inventory_unit_id;
  update public.scan_session
  set consumed_at = new.moved_at
  where workspace_id = new.workspace_id and id = new.scan_session_id;
  return new;
end $$;

revoke all on function finalize_inventory_movement() from public;

create trigger inventory_movement_finalize
after insert on inventory_movement
for each row execute function finalize_inventory_movement();

create or replace function apply_order_allocation_state() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  unit_status public.inventory_status;
  order_state text;
begin
  if tg_op = 'UPDATE' and (
    old.workspace_id is distinct from new.workspace_id
    or old.order_id is distinct from new.order_id
    or old.inventory_unit_id is distinct from new.inventory_unit_id
    or old.allocated_at is distinct from new.allocated_at
  ) then
    raise exception 'allocation identity is immutable';
  end if;
  if tg_op = 'INSERT' or (not old.active and new.active) then
    if not new.active or new.released_at is not null then
      raise exception 'active allocation cannot be released';
    end if;
    select status into unit_status from public.inventory_unit
    where workspace_id = new.workspace_id and id = new.inventory_unit_id for update;
    select state into order_state from public.sales_order
    where workspace_id = new.workspace_id and id = new.order_id for update;
    if unit_status <> 'available' or order_state <> 'confirmed' then
      raise exception 'allocation requires available inventory and a confirmed order';
    end if;
    update public.inventory_unit set status = 'reserved'
    where workspace_id = new.workspace_id and id = new.inventory_unit_id;
  elsif old.active and not new.active then
    if new.released_at is null then
      raise exception 'released allocation requires released_at';
    end if;
    update public.inventory_unit set status = 'available'
    where workspace_id = new.workspace_id and id = new.inventory_unit_id
      and not exists (
        select 1 from public.order_allocation other
        where other.workspace_id = new.workspace_id
          and other.inventory_unit_id = new.inventory_unit_id
          and other.id <> new.id and other.active
      );
  elsif old.active <> new.active or old.released_at is distinct from new.released_at then
    raise exception 'allocation release state is invalid';
  end if;
  return new;
end $$;

revoke all on function apply_order_allocation_state() from public;

create trigger order_allocation_state_guard
after insert or update on order_allocation
for each row execute function apply_order_allocation_state();

create or replace function validate_discrepancy_resolution() returns trigger
language plpgsql as $$
declare
  initial_counter uuid;
  distinct_actor_count integer;
begin
  if new.state <> 'resolved' then
    if new.resolved_at is not null then
      raise exception 'unresolved discrepancy cannot have resolved_at';
    end if;
    return new;
  end if;

  select initial_counter_id into initial_counter from count_session
  where workspace_id = new.workspace_id and id = new.count_session_id;
  if new.reconfirmer_id is null or new.approver_id is null
    or new.resolution is null or new.resolved_at is null then
    raise exception 'resolved discrepancy requires reconfirmation, approval, resolution and time';
  end if;
  if initial_counter = new.reconfirmer_id then
    raise exception 'initial counter and reconfirmer must be different people';
  end if;
  if new.requester_id = new.approver_id then
    raise exception 'requester and approver must be different people';
  end if;
  select count(distinct actor_id) into distinct_actor_count
  from unnest(array[initial_counter, new.reconfirmer_id, new.requester_id, new.approver_id])
    as actors(actor_id);
  if distinct_actor_count < 2 then
    raise exception 'at least two human actors are required';
  end if;
  return new;
end $$;

create trigger discrepancy_resolution_guard
before insert or update on inventory_discrepancy
for each row execute function validate_discrepancy_resolution();

alter table inventory_movement
  add constraint inventory_movement_idempotency_key_not_blank
    check (char_length(btrim(idempotency_key)) between 1 and 120),
  add constraint inventory_movement_payload_hash_hex
    check (payload_hash ~ '^[a-f0-9]{64}$');

revoke update on inventory_unit, scan_session, inventory_movement, count_observation,
  financial_event, audit_event, p0_workflow_action, media_asset, measurement_attempt
from resale_app_runtime;

commit;
