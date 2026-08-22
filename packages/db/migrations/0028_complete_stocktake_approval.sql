begin;

-- Do not invent a missing approver, approval time, or rollback state for historical
-- rows. Legitimate API-written sessions already satisfy this shape. If an invalid
-- direct-write row exists, stop the migration with all 0028 changes rolled back so a
-- human can inspect it without losing approval history.
do $$
begin
  if exists (
    select 1
    from count_session
    where (state = 'approved' and (approved_by is null or approved_at is null))
       or (state <> 'approved' and (approved_by is not null or approved_at is not null))
  ) then
    raise exception 'count_session approval state contains incomplete historical metadata'
      using errcode = '23514';
  end if;
end $$;

do $$
declare
  matched_constraint_count integer;
  legacy_constraint_definition text;
  normalized_definition text;
begin
  select count(*)::integer,
         min(pg_get_expr(constraint_row.conbin, constraint_row.conrelid))
  into matched_constraint_count, legacy_constraint_definition
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'count_session'::regclass
    and constraint_row.contype = 'c'
    and constraint_row.conname = 'count_session_approval_actor_mode_check';

  normalized_definition := regexp_replace(
    lower(coalesce(legacy_constraint_definition, '')),
    '[[:space:]()]', '', 'g'
  );
  if matched_constraint_count <> 1
    or position('approved_byisnull' in normalized_definition) = 0
    or position('solo_reversible' in normalized_definition) = 0
    or position('approved_by=initial_counter_id' in normalized_definition) = 0
    or position('dual_actor' in normalized_definition) = 0
    or position('approved_by<>initial_counter_id' in normalized_definition) = 0
    or position('approved_at' in normalized_definition) > 0
    or position('state=' in normalized_definition) > 0 then
    raise exception 'expected the 0027 count_session approval actor constraint';
  end if;

  alter table count_session drop constraint count_session_approval_actor_mode_check;
end $$;

alter table count_session
  add constraint count_session_approval_state_actor_check check (
    (
      state = 'approved'
      and approved_by is not null
      and approved_at is not null
      and (
        (confirmation_mode = 'solo_reversible' and approved_by = initial_counter_id)
        or (confirmation_mode = 'dual_actor' and approved_by <> initial_counter_id)
      )
    )
    or
    (state <> 'approved' and approved_by is null and approved_at is null)
  );

alter table pilot_run drop constraint pilot_run_migration_version_check;
alter table pilot_run add constraint pilot_run_migration_version_check
  check (migration_version in ('0023', '0024', '0025', '0026', '0027', '0028'));

comment on constraint count_session_approval_state_actor_check on count_session is
  'Approved sessions require an approval timestamp and the mode-authorized actor; non-approved sessions carry no approval metadata.';

commit;
