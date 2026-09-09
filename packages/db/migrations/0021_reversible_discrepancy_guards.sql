alter type inventory_status add value if not exists 'disposal_pending' after 'quarantined';

begin;

create table workspace_membership_gate (
  workspace_id uuid primary key references workspace(id),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default statement_timestamp()
);

insert into workspace_membership_gate (workspace_id)
select id from workspace
on conflict (workspace_id) do nothing;

alter table workspace_membership_gate enable row level security;
alter table workspace_membership_gate force row level security;
create policy workspace_isolation on workspace_membership_gate
using (workspace_id = app_workspace_id())
with check (workspace_id = app_workspace_id());

create or replace function lock_membership_gate() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  target_workspace_id uuid;
begin
  target_workspace_id := coalesce(new.workspace_id, old.workspace_id);
  perform pg_advisory_xact_lock(hashtextextended(target_workspace_id::text, 0));
  insert into public.workspace_membership_gate (workspace_id, revision, updated_at)
  values (target_workspace_id, 1, statement_timestamp())
  on conflict (workspace_id) do update
    set revision = public.workspace_membership_gate.revision + 1,
        updated_at = statement_timestamp();
  return coalesce(new, old);
end $$;

revoke all on function lock_membership_gate() from public;
create trigger workspace_membership_gate_guard
before insert or update or delete on workspace_membership
for each row execute function lock_membership_gate();

create or replace function lock_membership_gate_and_count(p_workspace_id uuid)
returns table(active_member_count integer, membership_revision bigint, confirmation_mode text)
language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if public.app_workspace_id() is distinct from p_workspace_id then
    raise exception 'workspace membership gate is outside the active workspace';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  insert into public.workspace_membership_gate (workspace_id)
  values (p_workspace_id)
  on conflict (workspace_id) do nothing;
  return query
    select count(*)::integer,
           gate.revision,
           case when count(*) = 1 then 'solo_reversible' else 'dual_actor' end
    from public.workspace_membership membership
    join public.workspace_membership_gate gate on gate.workspace_id = membership.workspace_id
    where membership.workspace_id = p_workspace_id and membership.active
    group by gate.revision;
end $$;

revoke all on function lock_membership_gate_and_count(uuid) from public;
grant execute on function lock_membership_gate_and_count(uuid) to resale_app_runtime;

alter table count_session
  add column confirmation_mode text,
  add column active_member_count integer,
  add column membership_revision bigint,
  add constraint count_session_confirmation_mode_check check (
    confirmation_mode is null
    or confirmation_mode in ('solo_reversible', 'dual_actor')
  ),
  add constraint count_session_membership_snapshot_check check (
    (confirmation_mode is null and active_member_count is null and membership_revision is null)
    or
    (confirmation_mode is not null and active_member_count is not null
      and active_member_count > 0 and membership_revision is not null
      and membership_revision > 0
      and ((confirmation_mode = 'solo_reversible' and active_member_count = 1)
        or (confirmation_mode = 'dual_actor' and active_member_count >= 2)))
  );

update count_session session
set active_member_count = snapshot.active_member_count,
    membership_revision = snapshot.membership_revision,
    confirmation_mode = case when snapshot.active_member_count = 1
      then 'solo_reversible' else 'dual_actor' end
from (
  select membership.workspace_id, count(*)::integer as active_member_count,
         gate.revision as membership_revision
  from workspace_membership membership
  join workspace_membership_gate gate on gate.workspace_id = membership.workspace_id
  where membership.active
  group by membership.workspace_id, gate.revision
) snapshot
where snapshot.workspace_id = session.workspace_id
  and session.confirmation_mode is null;

alter table count_session
  alter column confirmation_mode set not null,
  alter column active_member_count set not null,
  alter column membership_revision set not null;

create table discrepancy_evidence_media (
  id uuid not null,
  workspace_id uuid not null references workspace(id),
  discrepancy_id uuid not null,
  inventory_unit_id uuid not null,
  original_sha256 text not null check (original_sha256 ~ '^[a-f0-9]{64}$'),
  original_storage_key text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png')),
  size_bytes integer not null check (size_bytes between 1 and 26214400),
  width integer not null check (width between 1 and 12000),
  height integer not null check (height between 1 and 12000),
  created_by uuid not null references app_identity(id),
  created_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, id),
  unique (workspace_id, original_storage_key),
  foreign key (workspace_id, discrepancy_id)
    references inventory_discrepancy(workspace_id, id),
  foreign key (workspace_id, inventory_unit_id)
    references inventory_unit(workspace_id, id),
  check (original_storage_key like
    'workspaces/' || workspace_id::text || '/originals/discrepancy-%')
);

alter table discrepancy_evidence_media enable row level security;
alter table discrepancy_evidence_media force row level security;
create policy workspace_isolation on discrepancy_evidence_media
using (workspace_id = app_workspace_id())
with check (workspace_id = app_workspace_id());

alter table inventory_discrepancy
  add column confirmation_mode text,
  add column active_member_count integer,
  add column membership_revision bigint,
  add column evidence_media_id uuid,
  add column confirmation_scan_session_id uuid,
  add column restoration_scan_session_id uuid,
  add column reason_code text,
  add column reason_note text,
  add column confirmed_at timestamptz,
  add column restored_at timestamptz,
  add foreign key (workspace_id, evidence_media_id)
    references discrepancy_evidence_media(workspace_id, id),
  add foreign key (workspace_id, confirmation_scan_session_id)
    references scan_session(workspace_id, id),
  add foreign key (workspace_id, restoration_scan_session_id)
    references scan_session(workspace_id, id);

update inventory_discrepancy discrepancy
set confirmation_mode = session.confirmation_mode,
    active_member_count = session.active_member_count,
    membership_revision = session.membership_revision
from count_session session
where session.workspace_id = discrepancy.workspace_id
  and session.id = discrepancy.count_session_id
  and discrepancy.confirmation_mode is null;

alter table inventory_discrepancy
  alter column confirmation_mode set not null,
  alter column active_member_count set not null,
  alter column membership_revision set not null;

do $$
declare
  constraint_row record;
  definition text;
begin
  for constraint_row in
    select conname from pg_constraint
    where conrelid = 'inventory_discrepancy'::regclass and contype = 'c'
  loop
    select pg_get_constraintdef(oid) into definition
    from pg_constraint
    where conrelid = 'inventory_discrepancy'::regclass
      and conname = constraint_row.conname;
    if definition like '%state%' or definition like '%reconfirmer_id%'
      or definition like '%approver_id%' then
      execute format('alter table inventory_discrepancy drop constraint %I', constraint_row.conname);
    end if;
  end loop;
end $$;

alter table inventory_discrepancy
  add constraint inventory_discrepancy_state_check check (
    state in ('open', 'reconfirmation_required', 'approval_required',
      'resolved', 'candidate_confirmed', 'restored')
  ),
  add constraint inventory_discrepancy_mode_check check (
    confirmation_mode is null
    or confirmation_mode in ('solo_reversible', 'dual_actor')
  ),
  add constraint inventory_discrepancy_membership_snapshot_check check (
    (confirmation_mode is null and active_member_count is null and membership_revision is null)
    or
    (confirmation_mode is not null and active_member_count is not null
      and active_member_count > 0 and membership_revision is not null
      and membership_revision > 0
      and ((confirmation_mode = 'solo_reversible' and active_member_count = 1)
        or (confirmation_mode = 'dual_actor' and active_member_count >= 2)))
  ),
  add constraint inventory_discrepancy_reason_check check (
    reason_code is null or reason_code in (
      'not_seen_during_count', 'label_unreadable', 'location_mismatch',
      'found_in_place', 'found_after_move', 'counting_error'
    )
  ),
  add constraint inventory_discrepancy_reason_note_check check (
    reason_note is null or char_length(reason_note) between 1 and 500
  ),
  add constraint inventory_discrepancy_missing_state_check check (
    kind <> 'missing_candidate'
    or state in ('reconfirmation_required', 'candidate_confirmed', 'restored', 'resolved')
  ),
  add constraint inventory_discrepancy_other_state_check check (
    kind = 'missing_candidate'
    or state in ('open', 'reconfirmation_required', 'approval_required', 'resolved')
  ),
  add constraint inventory_discrepancy_confirmed_evidence_check check (
    state not in ('candidate_confirmed', 'restored')
    or (confirmation_mode is not null and active_member_count is not null
      and membership_revision is not null and evidence_media_id is not null
      and confirmation_scan_session_id is not null and reason_code is not null
      and reason_note is not null and confirmed_at is not null
      and reconfirmer_id is not null and approver_id is not null)
  ),
  add constraint inventory_discrepancy_restored_at_check check (
    (state = 'restored' and restored_at is not null and restoration_scan_session_id is not null)
    or (state <> 'restored' and restored_at is null and restoration_scan_session_id is null)
  ),
  add constraint inventory_discrepancy_dual_actor_check check (
    confirmation_mode <> 'dual_actor'
    or (reconfirmer_id is null or reconfirmer_id <> requester_id)
  ),
  add constraint inventory_discrepancy_resolved_check check (
    state <> 'resolved'
    or (reconfirmer_id is not null and approver_id is not null and resolution is not null)
  );

create or replace function guard_inventory_discrepancy_transition() returns trigger
language plpgsql as $$
declare
  session_mode text;
  session_member_count integer;
  session_membership_revision bigint;
begin
  if tg_op = 'INSERT' and new.confirmation_mode is null then
    select confirmation_mode, active_member_count, membership_revision
    into session_mode, session_member_count, session_membership_revision
    from count_session
    where workspace_id = new.workspace_id and id = new.count_session_id;
    new.confirmation_mode := session_mode;
    new.active_member_count := session_member_count;
    new.membership_revision := session_membership_revision;
  end if;
  if tg_op = 'INSERT' and new.kind = 'missing_candidate'
    and new.state <> 'reconfirmation_required' then
    raise exception 'a missing candidate must start in reconfirmation_required';
  end if;
  if tg_op = 'UPDATE' and old.kind = 'missing_candidate' then
    if old.state = 'resolved' then
      raise exception 'a legacy resolved missing candidate is immutable';
    end if;
    if new.kind <> old.kind then
      raise exception 'a missing candidate kind is immutable';
    end if;
    if new.state <> old.state and not (
      (old.state = 'reconfirmation_required' and new.state = 'candidate_confirmed')
      or (old.state = 'candidate_confirmed' and new.state = 'restored')
    ) then
      raise exception 'a missing candidate can only be confirmed and then restored';
    end if;
  end if;
  return new;
end $$;

create trigger inventory_discrepancy_transition_guard
before insert or update on inventory_discrepancy
for each row execute function guard_inventory_discrepancy_transition();

alter table scan_session
  add column discrepancy_id uuid,
  add foreign key (workspace_id, discrepancy_id)
    references inventory_discrepancy(workspace_id, id);

alter table scan_session drop constraint scan_session_operation_check;
alter table scan_session add constraint scan_session_operation_check
  check (operation in (
    'putaway', 'move', 'pick', 'return_quarantine',
    'discrepancy_confirm', 'discrepancy_restore'
  ));
alter table scan_session add constraint scan_session_discrepancy_operation_check check (
  (operation in ('discrepancy_confirm', 'discrepancy_restore') and discrepancy_id is not null)
  or (operation not in ('discrepancy_confirm', 'discrepancy_restore') and discrepancy_id is null)
);

create or replace function validate_discrepancy_scan_session() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  discrepancy_row inventory_discrepancy%rowtype;
  unit_row inventory_unit%rowtype;
  actor_role text;
begin
  if new.operation not in ('discrepancy_confirm', 'discrepancy_restore') then
    return new;
  end if;
  select * into discrepancy_row from inventory_discrepancy
  where workspace_id = new.workspace_id and id = new.discrepancy_id for update;
  select * into unit_row from inventory_unit
  where workspace_id = new.workspace_id and id = new.inventory_unit_id for update;
  select role into actor_role from workspace_membership
  where workspace_id = new.workspace_id and identity_id = new.confirmed_by and active;
  if discrepancy_row.id is null or discrepancy_row.kind <> 'missing_candidate'
    or discrepancy_row.inventory_unit_id <> new.inventory_unit_id then
    raise exception 'the discrepancy scan target is invalid';
  end if;
  if actor_role not in ('owner', 'inventory_manager') then
    raise exception 'inventory management must confirm a discrepancy scan';
  end if;
  if unit_row.status <> 'available'
    or unit_row.location_id is distinct from new.expected_location_id
    or unit_row.location_id is distinct from new.destination_location_id then
    raise exception 'the discrepancy scan requires available inventory at its current location';
  end if;
  if new.operation = 'discrepancy_confirm'
    and discrepancy_row.state <> 'reconfirmation_required' then
    raise exception 'the missing candidate is not awaiting confirmation';
  end if;
  if new.operation = 'discrepancy_restore'
    and discrepancy_row.state <> 'candidate_confirmed' then
    raise exception 'only a confirmed missing candidate can be restored';
  end if;
  return new;
end $$;

create trigger discrepancy_scan_session_guard
before insert on scan_session
for each row execute function validate_discrepancy_scan_session();

create table discrepancy_confirmation_challenge (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  discrepancy_id uuid not null,
  scan_session_id uuid not null,
  action text not null check (action in ('confirm_candidate', 'restore')),
  actor_id uuid not null references app_identity(id),
  confirmation_mode text not null check (
    confirmation_mode in ('solo_reversible', 'dual_actor')
  ),
  active_member_count integer not null check (active_member_count > 0),
  membership_revision bigint not null check (membership_revision > 0),
  issued_at timestamptz not null default clock_timestamp(),
  not_before timestamptz not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  primary key (workspace_id, id),
  unique (workspace_id, scan_session_id),
  foreign key (workspace_id, discrepancy_id)
    references inventory_discrepancy(workspace_id, id),
  foreign key (workspace_id, scan_session_id)
    references scan_session(workspace_id, id),
  check (not_before >= issued_at + interval '3 seconds'),
  check (expires_at > not_before and expires_at <= issued_at + interval '10 minutes'),
  check ((confirmation_mode = 'solo_reversible' and active_member_count = 1)
    or (confirmation_mode = 'dual_actor' and active_member_count >= 2))
);

create function consume_discrepancy_confirmation_challenge(
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

  update public.scan_session session
  set consumed_at = selected_used_at
  where session.workspace_id = target_workspace_id
    and session.id = selected_scan_session_id
    and session.discrepancy_id = target_discrepancy_id
    and session.consumed_at is null;
  if not found then
    raise exception 'the discrepancy scan session is unavailable' using errcode = '40001';
  end if;

  return query select selected_scan_session_id, selected_used_at;
end $$;

revoke all on function consume_discrepancy_confirmation_challenge(
  uuid, uuid, uuid, uuid, text, timestamptz
) from public;
grant execute on function consume_discrepancy_confirmation_challenge(
  uuid, uuid, uuid, uuid, text, timestamptz
) to resale_app_runtime;

alter table discrepancy_confirmation_challenge enable row level security;
alter table discrepancy_confirmation_challenge force row level security;
create policy workspace_isolation on discrepancy_confirmation_challenge
using (workspace_id = app_workspace_id())
with check (workspace_id = app_workspace_id());

create index active_missing_candidate_by_unit
on inventory_discrepancy(workspace_id, inventory_unit_id)
where kind = 'missing_candidate' and state = 'candidate_confirmed';

create or replace function prevent_missing_candidate_allocation() returns trigger
language plpgsql as $$
begin
  if new.active and exists (
    select 1 from inventory_discrepancy discrepancy
    where discrepancy.workspace_id = new.workspace_id
      and discrepancy.inventory_unit_id = new.inventory_unit_id
      and discrepancy.kind = 'missing_candidate'
      and discrepancy.state = 'candidate_confirmed'
  ) then
    raise exception 'confirmed missing inventory cannot be allocated';
  end if;
  return new;
end $$;

create trigger missing_candidate_allocation_guard
before insert or update of active, inventory_unit_id on order_allocation
for each row execute function prevent_missing_candidate_allocation();

create or replace function prevent_missing_candidate_listing() returns trigger
language plpgsql as $$
begin
  if new.state in (
    'listing_confirmed', 'listing_handoff', 'order_confirmed',
    'picked', 'packed', 'shipped', 'journal_approved'
  ) and exists (
    select 1 from inventory_unit unit
    join inventory_discrepancy discrepancy
      on discrepancy.workspace_id = unit.workspace_id
     and discrepancy.inventory_unit_id = unit.id
     and discrepancy.kind = 'missing_candidate'
     and discrepancy.state = 'candidate_confirmed'
    where unit.workspace_id = new.workspace_id and unit.sku_id = new.sku_id
  ) then
    raise exception 'confirmed missing inventory cannot be listed or fulfilled';
  end if;
  return new;
end $$;

create trigger missing_candidate_listing_guard
before update of state on p0_workflow
for each row execute function prevent_missing_candidate_listing();

create or replace function prevent_p0_irreversible_inventory_state() returns trigger
language plpgsql as $$
begin
  if new.status in ('lost', 'disposed')
    and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    raise exception 'irreversible inventory states are outside P0';
  end if;
  return new;
end $$;

create trigger p0_irreversible_inventory_state_guard
before insert or update of status on inventory_unit
for each row execute function prevent_p0_irreversible_inventory_state();

alter table return_inspection drop constraint return_inspection_resolution_check;
update return_inspection set resolution = 'disposal_pending' where resolution = 'dispose';
alter table return_inspection add constraint return_inspection_resolution_check
  check (resolution in ('restock', 'disposal_pending'));

alter table order_operation_record drop constraint order_operation_record_response_inventory_status_check;
update order_operation_record
set response_inventory_status = 'disposal_pending'
where response_inventory_status = 'disposed';
alter table order_operation_record add constraint order_operation_record_response_inventory_status_check
  check (response_inventory_status in (
    'reserved', 'picked', 'packed', 'shipped', 'quarantined',
    'available', 'disposal_pending'
  ));

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
                    else 'disposal_pending'::public.inventory_status end
  where workspace_id = new.workspace_id and id = new.inventory_unit_id;
  return new;
end $$;

grant select, insert on discrepancy_evidence_media to resale_app_runtime;
grant select, insert, update on discrepancy_confirmation_challenge to resale_app_runtime;

comment on table discrepancy_evidence_media is
  'Private, server-inspected JPEG/PNG evidence for a reversible missing candidate. Storage keys never leave authenticated server code.';
comment on table discrepancy_confirmation_challenge is
  'Single-use server clock gate for pointer/touch hold and keyboard countdown confirmation.';
comment on table workspace_membership_gate is
  'Revisioned concurrency gate used to choose solo_reversible or dual_actor without a client toggle.';

commit;
