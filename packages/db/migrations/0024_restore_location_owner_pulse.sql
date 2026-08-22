begin;

alter table inventory_movement
  drop constraint inventory_movement_movement_kind_check;
alter table inventory_movement
  add constraint inventory_movement_movement_kind_check
  check (movement_kind in (
    'putaway', 'move', 'pick', 'return_quarantine', 'discrepancy_restore'
  ));

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
    raise exception 'inventory management must confirm a discrepancy scan';
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
  selected_scan_session_id uuid;
  selected_used_at timestamptz;
begin
  if target_workspace_id is distinct from public.app_workspace_id() then
    raise exception 'workspace context does not match the challenge';
  end if;
  if target_action not in ('confirm_candidate', 'restore') then
    raise exception 'the challenge action is invalid';
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
  returning challenge.scan_session_id, challenge.used_at
  into selected_scan_session_id, selected_used_at;

  if selected_scan_session_id is null then
    return;
  end if;

  if target_action = 'confirm_candidate' then
    update public.scan_session session
    set consumed_at = selected_used_at
    where session.workspace_id = target_workspace_id
      and session.id = selected_scan_session_id
      and session.discrepancy_id = target_discrepancy_id
      and session.consumed_at is null;
  else
    perform 1 from public.scan_session session
    where session.workspace_id = target_workspace_id
      and session.id = selected_scan_session_id
      and session.discrepancy_id = target_discrepancy_id
      and session.consumed_at is null
    for update;
  end if;
  if not found then
    raise exception 'the discrepancy scan session is unavailable' using errcode = '40001';
  end if;

  return query select selected_scan_session_id, selected_used_at;
end $$;

alter table pilot_run drop constraint pilot_run_migration_version_check;
alter table pilot_run add constraint pilot_run_migration_version_check
  check (migration_version in ('0023', '0024'));

create table pilot_exception_event (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  pilot_run_id uuid not null,
  pilot_item_measurement_id uuid not null,
  event_type text not null check (event_type in (
    'invalid_attempt', 'missing_required_image', 'measurement_rework',
    'label_location_mismatch', 'misputaway', 'network_retry', 'manual_correction'
  )),
  detail_code text not null check (
    char_length(detail_code) between 1 and 80 and detail_code ~ '^[a-z0-9_]+$'
  ),
  idempotency_key uuid not null,
  payload_hash char(64) not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  actor_id uuid not null references app_identity(id),
  recorded_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, id),
  unique (workspace_id, pilot_run_id, idempotency_key),
  foreign key (workspace_id, pilot_run_id) references pilot_run(workspace_id, id),
  foreign key (workspace_id, pilot_item_measurement_id)
    references pilot_item_measurement(workspace_id, id)
);

create or replace function validate_pilot_exception_insert() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  run_row public.pilot_run%rowtype;
  item_row public.pilot_item_measurement%rowtype;
begin
  select * into run_row from public.pilot_run
  where workspace_id = new.workspace_id and id = new.pilot_run_id for update;
  select * into item_row from public.pilot_item_measurement
  where workspace_id = new.workspace_id and id = new.pilot_item_measurement_id for update;
  if run_row.id is null or run_row.state <> 'active' or run_row.actor_id <> new.actor_id then
    raise exception 'pilot exception requires the active run actor';
  end if;
  if item_row.id is null or item_row.pilot_run_id <> new.pilot_run_id
    or item_row.completed_at is not null then
    raise exception 'pilot exception requires the active incomplete item';
  end if;
  return new;
end $$;

create trigger pilot_exception_insert_guard
before insert on pilot_exception_event
for each row execute function validate_pilot_exception_insert();

create or replace function prevent_pilot_exception_rewrite() returns trigger
language plpgsql as $$
begin
  raise exception 'pilot exception events are append-only';
end $$;

create trigger pilot_exception_immutable_guard
before update or delete on pilot_exception_event
for each row execute function prevent_pilot_exception_rewrite();

alter table pilot_exception_event enable row level security;
alter table pilot_exception_event force row level security;
create policy workspace_isolation on pilot_exception_event
  using (workspace_id = app_workspace_id())
  with check (workspace_id = app_workspace_id());

grant select, insert on pilot_exception_event to resale_app_runtime;

comment on constraint inventory_movement_movement_kind_check on inventory_movement is
  'A reversible discrepancy restore is a scanned, audited movement when the found location changed.';
comment on table pilot_exception_event is
  'Append-only server-timestamped pilot exceptions. Client aggregate counters are not trusted.';

commit;
