begin;

-- Before confirmation_mode existed, 0001 required every stored approval to use a
-- different actor. 0021 inferred the mode of those historical sessions from the
-- then-current active membership count, which can classify a two-actor historical
-- approval as solo_reversible after one actor becomes inactive. The two distinct
-- stored actor IDs prove a minimum historical actor count of two. Preserve the
-- actors/timestamps/audit and repair only the inferred mode/count snapshots before
-- validation. The named legacy-immutability trigger is disabled only for this metadata
-- backfill and is re-enabled in the same transaction; any failure rolls both changes back.
alter table inventory_discrepancy
  disable trigger inventory_discrepancy_transition_guard;

update inventory_discrepancy discrepancy
set confirmation_mode = 'dual_actor',
    active_member_count = greatest(discrepancy.active_member_count, 2)
from count_session session
where session.workspace_id = discrepancy.workspace_id
  and session.id = discrepancy.count_session_id
  and session.confirmation_mode = 'solo_reversible'
  and session.approved_by is not null
  and session.approved_by <> session.initial_counter_id
  and discrepancy.confirmation_mode = 'solo_reversible';

alter table inventory_discrepancy
  enable trigger inventory_discrepancy_transition_guard;

update count_session
set confirmation_mode = 'dual_actor',
    active_member_count = greatest(active_member_count, 2)
where confirmation_mode = 'solo_reversible'
  and approved_by is not null
  and approved_by <> initial_counter_id;

do $$
declare
  legacy_constraint_name name;
  matched_constraint_count integer;
begin
  select min(constraint_row.conname::text)::name, count(*)::integer
  into legacy_constraint_name, matched_constraint_count
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'count_session'::regclass
    and constraint_row.contype = 'c'
    and regexp_replace(
      lower(pg_get_expr(constraint_row.conbin, constraint_row.conrelid)),
      '[[:space:]()]', '', 'g'
    ) = 'approved_byisnullorapproved_by<>initial_counter_id';

  if matched_constraint_count <> 1 then
    raise exception 'expected exactly one legacy count_session approval actor constraint';
  end if;
  execute format('alter table count_session drop constraint %I', legacy_constraint_name);
end $$;

alter table count_session add constraint count_session_approval_actor_mode_check check (
  approved_by is null
  or (confirmation_mode = 'solo_reversible' and approved_by = initial_counter_id)
  or (confirmation_mode = 'dual_actor' and approved_by <> initial_counter_id)
);

alter table pilot_run drop constraint pilot_run_migration_version_check;
alter table pilot_run add constraint pilot_run_migration_version_check
  check (migration_version in ('0023', '0024', '0025', '0026', '0027'));

comment on constraint count_session_approval_actor_mode_check on count_session is
  'solo_reversible approvals require the initial counter; dual_actor approvals require a different actor.';

commit;
