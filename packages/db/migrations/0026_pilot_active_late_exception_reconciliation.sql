begin;

alter table pilot_run drop constraint pilot_run_migration_version_check;
alter table pilot_run add constraint pilot_run_migration_version_check
  check (migration_version in ('0023', '0024', '0025', '0026'));

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
      raise exception 'pilot exception requires the latest incomplete item';
    end if;
  elsif item_row.completed_at is null or item_row.id is distinct from latest_completed_item_id then
    raise exception 'late pilot exception requires the latest completed item';
  end if;
  return new;
end $$;

comment on function validate_pilot_exception_insert() is
  'Accepts events only for the latest incomplete item, or for the latest completed item when no incomplete item remains, including an active run after a lost response.';

commit;
