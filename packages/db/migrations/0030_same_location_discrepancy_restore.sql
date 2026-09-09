begin;

-- The runtime role intentionally cannot update scan_session directly. A restore to a
-- different location consumes its scan session through the SECURITY DEFINER movement
-- trigger, while a restore at the recorded location has no movement row. Consume that
-- no-movement scan here, inside the same single-use challenge transaction, after
-- rechecking the current unit and both labels.
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
  session_row public.scan_session%rowtype;
  unit_row public.inventory_unit%rowtype;
  item_label public.inventory_label%rowtype;
  place_label public.inventory_label%rowtype;
  expected_operation text;
begin
  if target_workspace_id is distinct from public.app_workspace_id() then
    raise exception 'workspace context does not match the challenge';
  end if;
  if target_action not in ('confirm_candidate', 'restore') then
    raise exception 'the challenge action is invalid';
  end if;
  expected_operation := case
    when target_action = 'confirm_candidate' then 'discrepancy_confirm'
    else 'discrepancy_restore'
  end;

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

  select * into session_row
  from public.scan_session session
  where session.workspace_id = target_workspace_id
    and session.id = selected_scan_session_id
    and session.discrepancy_id = target_discrepancy_id
    and session.consumed_at is null
  for update;
  if session_row.id is null
    or session_row.confirmed_by is distinct from target_actor_id
    or session_row.operation <> expected_operation then
    raise exception 'the discrepancy scan session is unavailable' using errcode = '40001';
  end if;

  if target_action = 'confirm_candidate' then
    update public.scan_session session
    set consumed_at = selected_used_at
    where session.workspace_id = target_workspace_id
      and session.id = selected_scan_session_id
      and session.consumed_at is null;
    if not found then
      raise exception 'the discrepancy scan session is unavailable' using errcode = '40001';
    end if;
  elsif session_row.destination_location_id is not distinct from session_row.expected_location_id then
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

    if unit_row.id is null
      or unit_row.status <> 'available'
      or unit_row.location_id is distinct from session_row.expected_location_id
      or unit_row.location_id is distinct from session_row.destination_location_id
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
      or place_label.version <> session_row.location_label_version then
      raise exception 'the same-location restore scan became stale' using errcode = '40001';
    end if;

    update public.scan_session session
    set consumed_at = selected_used_at
    where session.workspace_id = target_workspace_id
      and session.id = selected_scan_session_id
      and session.consumed_at is null;
    if not found then
      raise exception 'the discrepancy scan session is unavailable' using errcode = '40001';
    end if;
  end if;

  return query select selected_scan_session_id, selected_used_at;
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
  'Atomically consumes a challenge and its scan. Same-location restores recheck current inventory and labels without granting direct scan_session updates.';

commit;
