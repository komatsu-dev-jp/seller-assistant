begin;

alter table pilot_run drop constraint pilot_run_migration_version_check;
alter table pilot_run add constraint pilot_run_migration_version_check
  check (migration_version in ('0023', '0024', '0025'));

create or replace function validate_pilot_exception_insert() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  run_row public.pilot_run%rowtype;
  item_row public.pilot_item_measurement%rowtype;
  latest_incomplete_item_id uuid;
  latest_completed_item_id uuid;
begin
  select * into run_row from public.pilot_run
  where workspace_id = new.workspace_id and id = new.pilot_run_id for update;
  select * into item_row from public.pilot_item_measurement
  where workspace_id = new.workspace_id and id = new.pilot_item_measurement_id for update;

  if run_row.id is null or run_row.actor_id <> new.actor_id then
    raise exception 'pilot exception requires the original run actor';
  end if;
  if item_row.id is null or item_row.pilot_run_id <> new.pilot_run_id then
    raise exception 'pilot exception item must belong to the run';
  end if;

  if run_row.state = 'active' then
    if item_row.completed_at is not null then
      raise exception 'active pilot exception requires the incomplete item';
    end if;
  else
    select id into latest_incomplete_item_id
    from public.pilot_item_measurement
    where workspace_id = new.workspace_id and pilot_run_id = new.pilot_run_id
      and completed_at is null
    order by started_at desc, id desc
    limit 1;
    select id into latest_completed_item_id
    from public.pilot_item_measurement
    where workspace_id = new.workspace_id and pilot_run_id = new.pilot_run_id
      and completed_at is not null
    order by completed_at desc, started_at desc, id desc
    limit 1;
    if latest_incomplete_item_id is not null then
      if item_row.id is distinct from latest_incomplete_item_id then
        raise exception 'late pilot exception requires the latest incomplete item';
      end if;
    elsif item_row.completed_at is null or item_row.id is distinct from latest_completed_item_id then
      raise exception 'late pilot exception requires the latest completed item';
    end if;
  end if;
  return new;
end $$;

create or replace function prevent_pilot_run_rewrite() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'pilot runs cannot be deleted';
  end if;
  if old.workspace_id <> new.workspace_id
    or old.id <> new.id
    or old.protocol_version <> new.protocol_version
    or old.commit_sha <> new.commit_sha
    or old.migration_version <> new.migration_version
    or old.platform <> new.platform
    or old.browser <> new.browser
    or old.viewport <> new.viewport
    or old.actor_id <> new.actor_id
    or old.warmup_completed_at <> new.warmup_completed_at
    or old.started_at <> new.started_at then
    raise exception 'pilot run environment is immutable';
  end if;

  if old.state = 'active' then
    if new.state = 'active' then
      raise exception 'pilot run update must finish the run';
    end if;
    return new;
  end if;

  if old.state = 'completed'
    and new.state = 'failed'
    and not new.externally_invalidated
    and new.external_invalidation_reason is null
    and new.completed_at is not distinct from old.completed_at then
    return new;
  end if;

  raise exception 'finished pilot runs are immutable except for late exception invalidation';
end $$;

comment on function validate_pilot_exception_insert() is
  'Accepts queued events for the active item, or for the latest completed item so a lost response cannot leave a false pilot pass.';
comment on function prevent_pilot_run_rewrite() is
  'Keeps terminal runs immutable while allowing a completed run to fail after a late safety exception is reconciled.';

commit;
