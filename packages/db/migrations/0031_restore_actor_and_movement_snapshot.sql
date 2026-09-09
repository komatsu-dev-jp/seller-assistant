begin;

-- Existing scan sessions predate this snapshot and deliberately remain null. They
-- fail closed at consumption time so the operator must issue a new challenge from a
-- fresh scan instead of guessing whether the inventory moved away and came back.
alter table scan_session
  add column inventory_movement_seq_snapshot bigint;

alter table scan_session
  add constraint scan_session_inventory_movement_seq_snapshot_check
  check (inventory_movement_seq_snapshot is null or inventory_movement_seq_snapshot >= 0);

-- Capture the sequence while holding the unit lock already required by the guarded
-- discrepancy scan insert. This avoids granting the runtime role UPDATE/FOR UPDATE
-- access to inventory_unit and avoids trusting a sequence supplied by application code.
create or replace function validate_discrepancy_scan_session() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  discrepancy_row public.inventory_discrepancy%rowtype;
  unit_row public.inventory_unit%rowtype;
  destination_row public.location_node%rowtype;
  actor_role text;
begin
  if new.operation not in ('discrepancy_confirm', 'discrepancy_restore') then
    return new;
  end if;
  if new.confirmed_by is distinct from public.app_identity_id() then
    raise exception 'the discrepancy scan actor does not match the authenticated actor'
      using errcode = '42501';
  end if;

  select * into discrepancy_row from public.inventory_discrepancy
  where workspace_id = new.workspace_id and id = new.discrepancy_id for update;
  select * into unit_row from public.inventory_unit
  where workspace_id = new.workspace_id and id = new.inventory_unit_id for update;
  select * into destination_row from public.location_node
  where workspace_id = new.workspace_id and id = new.destination_location_id;
  select role into actor_role from public.workspace_membership
  where workspace_id = new.workspace_id and identity_id = new.confirmed_by and active;
  if discrepancy_row.id is null or discrepancy_row.kind <> 'missing_candidate'
    or discrepancy_row.inventory_unit_id <> new.inventory_unit_id then
    raise exception 'the discrepancy scan target is invalid';
  end if;
  if actor_role not in ('owner', 'inventory_manager') then
    raise exception 'inventory management must confirm a discrepancy scan'
      using errcode = '42501';
  end if;
  if unit_row.status <> 'available'
    or unit_row.location_id is distinct from new.expected_location_id then
    raise exception 'the discrepancy scan requires available inventory at its recorded location';
  end if;
  if destination_row.id is null or destination_row.state <> 'active'
    or not destination_row.can_store_inventory then
    raise exception 'the rescanned destination cannot store inventory';
  end if;
  if new.operation = 'discrepancy_confirm' then
    if discrepancy_row.state <> 'reconfirmation_required'
      or unit_row.location_id is distinct from new.destination_location_id then
      raise exception 'the missing candidate must be confirmed at its recorded location';
    end if;
  elsif discrepancy_row.state <> 'candidate_confirmed' then
    raise exception 'only a confirmed missing candidate can be restored';
  end if;

  if new.inventory_movement_seq_snapshot is not null
    and new.inventory_movement_seq_snapshot is distinct from unit_row.movement_seq then
    raise exception 'the discrepancy movement snapshot is stale' using errcode = '40001';
  end if;
  new.inventory_movement_seq_snapshot := unit_row.movement_seq;
  return new;
end $$;

-- This SECURITY DEFINER function is the final authorization and freshness boundary
-- for discrepancy confirmation/restoration. The API must set app.workspace_id and
-- app.identity_id transaction-locally from its authenticated server session. The
-- runtime database credentials and the ability to choose those GUC values are a
-- trusted-server boundary and must never be exposed to an untrusted client.
create or replace function consume_discrepancy_confirmation_challenge(
  target_workspace_id uuid,
  target_challenge_id uuid,
  target_discrepancy_id uuid,
  target_actor_id uuid,
  target_action text,
  client_confirmed_at timestamptz
) returns table(scan_session_id uuid, used_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  challenge_row public.discrepancy_confirmation_challenge%rowtype;
  discrepancy_row public.inventory_discrepancy%rowtype;
  membership_row public.workspace_membership%rowtype;
  session_row public.scan_session%rowtype;
  unit_row public.inventory_unit%rowtype;
  item_label public.inventory_label%rowtype;
  place_label public.inventory_label%rowtype;
  destination_row public.location_node%rowtype;
  selected_used_at timestamptz;
  expected_operation text;
  expected_state text;
begin
  if target_workspace_id is distinct from public.app_workspace_id() then
    raise exception 'workspace context does not match the challenge' using errcode = '42501';
  end if;
  if target_actor_id is null
    or target_actor_id is distinct from public.app_identity_id() then
    raise exception 'actor context does not match the challenge' using errcode = '42501';
  end if;
  if target_action not in ('confirm_candidate', 'restore') then
    raise exception 'the challenge action is invalid' using errcode = '40001';
  end if;

  if target_action = 'confirm_candidate' then
    expected_operation := 'discrepancy_confirm';
    expected_state := 'reconfirmation_required';
  else
    expected_operation := 'discrepancy_restore';
    expected_state := 'candidate_confirmed';
  end if;

  select * into challenge_row
  from public.discrepancy_confirmation_challenge challenge
  where challenge.workspace_id = target_workspace_id
    and challenge.id = target_challenge_id
  for update;
  if challenge_row.id is null
    or challenge_row.discrepancy_id <> target_discrepancy_id
    or challenge_row.actor_id <> target_actor_id
    or challenge_row.action <> target_action
    or challenge_row.used_at is not null then
    return;
  end if;

  select * into discrepancy_row
  from public.inventory_discrepancy discrepancy
  where discrepancy.workspace_id = target_workspace_id
    and discrepancy.id = target_discrepancy_id
  for update;
  if discrepancy_row.id is null
    or discrepancy_row.kind <> 'missing_candidate'
    or discrepancy_row.state <> expected_state then
    raise exception 'the discrepancy state no longer permits this challenge'
      using errcode = '40001';
  end if;

  -- Lock the exact membership row so a concurrent cancellation either commits first
  -- and is observed here, or waits until this authorized transaction has completed.
  select * into membership_row
  from public.workspace_membership membership
  where membership.workspace_id = target_workspace_id
    and membership.identity_id = target_actor_id
  for update;
  if membership_row.identity_id is null
    or not membership_row.active
    or membership_row.role not in ('owner', 'inventory_manager') then
    raise exception 'active inventory management membership is required'
      using errcode = '42501';
  end if;

  select * into session_row
  from public.scan_session session
  where session.workspace_id = target_workspace_id
    and session.id = challenge_row.scan_session_id
  for update;
  if session_row.id is null
    or session_row.discrepancy_id is distinct from target_discrepancy_id
    or session_row.inventory_unit_id is distinct from discrepancy_row.inventory_unit_id
    or session_row.confirmed_by is distinct from target_actor_id
    or session_row.operation <> expected_operation
    or session_row.consumed_at is not null then
    raise exception 'the discrepancy scan session is unavailable' using errcode = '40001';
  end if;
  if session_row.inventory_movement_seq_snapshot is null then
    raise exception 'the legacy discrepancy scan must be reissued' using errcode = '40001';
  end if;

  select * into unit_row
  from public.inventory_unit unit
  where unit.workspace_id = target_workspace_id
    and unit.id = session_row.inventory_unit_id
  for update;
  select * into item_label
  from public.inventory_label label
  where label.id = session_row.inventory_label_id
  for share;
  select * into place_label
  from public.inventory_label label
  where label.id = session_row.location_label_id
  for share;
  select * into destination_row
  from public.location_node location
  where location.workspace_id = target_workspace_id
    and location.id = session_row.destination_location_id
  for share;

  if unit_row.id is null
    or unit_row.status <> 'available'
    or unit_row.location_id is distinct from session_row.expected_location_id
    or unit_row.movement_seq is distinct from session_row.inventory_movement_seq_snapshot
    or item_label.id is null
    or item_label.workspace_id <> target_workspace_id
    or item_label.target_type <> 'inventory_unit'
    or item_label.target_id <> session_row.inventory_unit_id
    or not item_label.active
    or item_label.version <> session_row.inventory_label_version
    or place_label.id is null
    or place_label.workspace_id <> target_workspace_id
    or place_label.target_type <> 'location'
    or place_label.target_id <> session_row.destination_location_id
    or not place_label.active
    or place_label.version <> session_row.location_label_version
    or destination_row.id is null
    or destination_row.state <> 'active'
    or not destination_row.can_store_inventory
    or (target_action = 'confirm_candidate'
      and session_row.destination_location_id is distinct from session_row.expected_location_id) then
    raise exception 'the discrepancy scan became stale; rescan is required'
      using errcode = '40001';
  end if;

  update public.discrepancy_confirmation_challenge challenge
  set used_at = clock_timestamp()
  where challenge.workspace_id = target_workspace_id
    and challenge.id = target_challenge_id
    and challenge.discrepancy_id = target_discrepancy_id
    and challenge.actor_id = target_actor_id
    and challenge.action = target_action
    and challenge.used_at is null
    and clock_timestamp() >= challenge.not_before
    and clock_timestamp() <= challenge.expires_at
    and client_confirmed_at >= challenge.not_before
    and client_confirmed_at <= challenge.expires_at
  returning challenge.used_at into selected_used_at;

  if selected_used_at is null then
    return;
  end if;

  if target_action = 'confirm_candidate'
    or session_row.destination_location_id is not distinct from session_row.expected_location_id then
    update public.scan_session session
    set consumed_at = selected_used_at
    where session.workspace_id = target_workspace_id
      and session.id = challenge_row.scan_session_id
      and session.consumed_at is null;
    if not found then
      raise exception 'the discrepancy scan session is unavailable' using errcode = '40001';
    end if;
  end if;

  return query select challenge_row.scan_session_id, selected_used_at;
end $$;

revoke all on function consume_discrepancy_confirmation_challenge(
  uuid, uuid, uuid, uuid, text, timestamptz
) from public;
grant execute on function consume_discrepancy_confirmation_challenge(
  uuid, uuid, uuid, uuid, text, timestamptz
) to resale_app_runtime;

comment on function consume_discrepancy_confirmation_challenge(
  uuid, uuid, uuid, uuid, text, timestamptz
) is
  'Consumes a discrepancy challenge only for the transaction-local authenticated actor with active inventory-management membership and an unchanged inventory movement snapshot. Runtime credentials and identity GUC control remain a trusted-server boundary.';

comment on column scan_session.inventory_movement_seq_snapshot is
  'Inventory movement sequence captured for a newly issued discrepancy challenge. Null legacy sessions fail closed and must be reissued.';

commit;
