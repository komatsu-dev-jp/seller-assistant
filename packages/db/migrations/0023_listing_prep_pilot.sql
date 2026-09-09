begin;

create table pilot_run (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  protocol_version text not null check (protocol_version = 'listing_prep_pilot_v1.0.0'),
  commit_sha text not null check (commit_sha ~ '^[a-f0-9]{40}$'),
  migration_version text not null check (migration_version = '0023'),
  platform text not null check (char_length(platform) between 1 and 120),
  browser text not null check (char_length(browser) between 1 and 200),
  viewport text not null check (viewport = '390x844'),
  actor_id uuid not null references app_identity(id),
  warmup_completed_at timestamptz not null,
  state text not null default 'active'
    check (state in ('active', 'completed', 'failed', 'externally_invalidated')),
  externally_invalidated boolean not null default false,
  external_invalidation_reason text
    check (external_invalidation_reason is null or char_length(external_invalidation_reason) <= 200),
  started_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  primary key (workspace_id, id),
  check ((state = 'active') = (completed_at is null)),
  check (externally_invalidated = (state = 'externally_invalidated')),
  check ((not externally_invalidated) = (external_invalidation_reason is null)),
  check (completed_at is null or completed_at >= started_at)
);

create unique index pilot_run_one_active_per_workspace
  on pilot_run (workspace_id) where state = 'active';

create table pilot_item_measurement (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  pilot_run_id uuid not null,
  sku_id uuid not null,
  product_fixture_id text not null
    check (product_fixture_id in (
      'TOP-01', 'TOP-02', 'TOP-03', 'TOP-04',
      'OUTER-01', 'OUTER-02', 'PANTS-01', 'PANTS-02', 'KNIT-01', 'KNIT-02'
    )),
  category text not null check (category in ('tops', 'outer', 'pants', 'knit')),
  started_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  elapsed_seconds numeric(12, 3)
    generated always as (
      case when completed_at is null then null
        else extract(epoch from (completed_at - started_at)) end
    ) stored,
  invalid_attempt_count integer not null default 0 check (invalid_attempt_count >= 0),
  missing_required_image_count integer not null default 0 check (missing_required_image_count >= 0),
  measurement_rework_count integer not null default 0 check (measurement_rework_count >= 0),
  label_location_mismatch_count integer not null default 0 check (label_location_mismatch_count >= 0),
  misputaway_count integer not null default 0 check (misputaway_count >= 0),
  network_retry_count integer not null default 0 check (network_retry_count >= 0),
  manual_correction_count integer not null default 0 check (manual_correction_count >= 0),
  copy_ready_workflow_version integer check (copy_ready_workflow_version > 0),
  primary key (workspace_id, id),
  unique (workspace_id, pilot_run_id, product_fixture_id),
  unique (workspace_id, pilot_run_id, sku_id),
  foreign key (workspace_id, pilot_run_id) references pilot_run(workspace_id, id),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id),
  check (
    (product_fixture_id like 'TOP-%' and category = 'tops')
    or (product_fixture_id like 'OUTER-%' and category = 'outer')
    or (product_fixture_id like 'PANTS-%' and category = 'pants')
    or (product_fixture_id like 'KNIT-%' and category = 'knit')
  ),
  check (
    (completed_at is null and copy_ready_workflow_version is null)
    or (completed_at is not null and copy_ready_workflow_version is not null)
  ),
  check (completed_at is null or completed_at >= started_at)
);

create or replace function validate_pilot_item_insert() returns trigger
language plpgsql as $$
declare
  run_state text;
  existing_count integer;
begin
  select state into run_state from pilot_run
  where workspace_id = new.workspace_id and id = new.pilot_run_id
  for update;
  if run_state is distinct from 'active' then
    raise exception 'pilot run is not active';
  end if;
  select count(*)::integer into existing_count from pilot_item_measurement
  where workspace_id = new.workspace_id and pilot_run_id = new.pilot_run_id;
  if existing_count >= 10 then
    raise exception 'pilot run already contains ten products';
  end if;
  return new;
end $$;

create trigger pilot_item_insert_guard
before insert on pilot_item_measurement
for each row execute function validate_pilot_item_insert();

create or replace function prevent_pilot_item_rewrite() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'pilot item measurements cannot be deleted';
  end if;
  if old.completed_at is not null then
    raise exception 'completed pilot item measurements are immutable';
  end if;
  if old.workspace_id <> new.workspace_id
    or old.id <> new.id
    or old.pilot_run_id <> new.pilot_run_id
    or old.sku_id <> new.sku_id
    or old.product_fixture_id <> new.product_fixture_id
    or old.category <> new.category
    or old.started_at <> new.started_at then
    raise exception 'pilot item identity and start time are immutable';
  end if;
  if new.completed_at is null then
    raise exception 'pilot item updates must complete the measurement';
  end if;
  return new;
end $$;

create trigger pilot_item_immutable_guard
before update or delete on pilot_item_measurement
for each row execute function prevent_pilot_item_rewrite();

create or replace function prevent_pilot_run_rewrite() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'pilot runs cannot be deleted';
  end if;
  if old.state <> 'active' then
    raise exception 'finished pilot runs are immutable';
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
  if new.state = 'active' then
    raise exception 'pilot run update must finish the run';
  end if;
  return new;
end $$;

create trigger pilot_run_immutable_guard
before update or delete on pilot_run
for each row execute function prevent_pilot_run_rewrite();

alter table pilot_run enable row level security;
alter table pilot_run force row level security;
create policy workspace_isolation on pilot_run
  using (workspace_id = app_workspace_id())
  with check (workspace_id = app_workspace_id());

alter table pilot_item_measurement enable row level security;
alter table pilot_item_measurement force row level security;
create policy workspace_isolation on pilot_item_measurement
  using (workspace_id = app_workspace_id())
  with check (workspace_id = app_workspace_id());

grant select, insert, update on pilot_run, pilot_item_measurement to resale_app_runtime;

comment on table pilot_run is
  'Versioned, local-only ten-product listing-preparation pilot. Environment and actor are immutable.';
comment on table pilot_item_measurement is
  'Server-clock wall-time and exception counts for every fixed pilot fixture. Completed rows cannot be rewritten or deleted.';

commit;
