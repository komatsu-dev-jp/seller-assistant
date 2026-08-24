begin;

alter table product_identity_candidate
  add column color_candidate text;

alter table pilot_run
  add column fixture_manifest_sha256 char(64);

alter table pilot_run drop constraint pilot_run_protocol_version_check;
alter table pilot_run add constraint pilot_run_protocol_version_check
  check (protocol_version in ('listing_prep_pilot_v1.0.0', 'listing_prep_pilot_v1.1.0'));

alter table pilot_run drop constraint pilot_run_migration_version_check;
alter table pilot_run add constraint pilot_run_migration_version_check
  check (migration_version in (
    '0023', '0024', '0025', '0026', '0027', '0028', '0029', '0030', '0031', '0032',
    '0033'
  ));

alter table pilot_run add constraint pilot_run_protocol_fixture_check
  check (
    (
      protocol_version = 'listing_prep_pilot_v1.0.0'
      and migration_version <> '0033'
      and fixture_manifest_sha256 is null
    )
    or (
      protocol_version = 'listing_prep_pilot_v1.1.0'
      and migration_version = '0033'
      and fixture_manifest_sha256 =
        'a44d25d914d721c1a62aa4330688bf64264eae54c8ddb38c833cd20b6827fa18'
    )
  );

alter table pilot_item_measurement
  add column measurement_template_id text,
  add column measurement_template_version integer;

alter table pilot_item_measurement add constraint pilot_item_measurement_template_check
  check (
    (measurement_template_id is null and measurement_template_version is null)
    or (
      measurement_template_version = 1
      and (
        (category = 'tops' and measurement_template_id = 'tops_standard_v1')
        or (category = 'outer' and measurement_template_id = 'outer_standard_v1')
        or (category = 'pants' and measurement_template_id = 'pants_standard_v1')
        or (category = 'knit' and measurement_template_id = 'knit_set_in_v1')
      )
    )
  );

create table product_measurement_profile (
  workspace_id uuid not null references workspace(id),
  sku_id uuid not null,
  category text not null check (category in ('tops', 'outer', 'pants', 'knit')),
  measurement_template_id text not null,
  measurement_template_version integer not null check (measurement_template_version = 1),
  confirmed_by uuid not null references app_identity(id),
  confirmed_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, sku_id),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id),
  check (
    (category = 'tops' and measurement_template_id = 'tops_standard_v1')
    or (category = 'outer' and measurement_template_id = 'outer_standard_v1')
    or (category = 'pants' and measurement_template_id = 'pants_standard_v1')
    or (category = 'knit' and measurement_template_id = 'knit_set_in_v1')
  )
);

create or replace function validate_product_measurement_profile_insert() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  sku_category text;
begin
  select category into sku_category
  from public.product_sku
  where workspace_id = new.workspace_id and id = new.sku_id;

  if sku_category is null then
    raise exception 'measurement profile SKU is unavailable';
  end if;
  if not (
    (new.category = 'tops' and sku_category in ('tops', 'トップス'))
    or (new.category = 'outer' and sku_category in ('outer', 'アウター'))
    or (new.category = 'pants' and sku_category in ('pants', 'パンツ'))
    or (new.category = 'knit' and sku_category in ('knit', 'ニット'))
  ) then
    raise exception 'measurement profile category does not match the SKU';
  end if;
  return new;
end $$;

create trigger product_measurement_profile_insert_guard
before insert on product_measurement_profile
for each row execute function validate_product_measurement_profile_insert();

create or replace function prevent_product_measurement_profile_rewrite() returns trigger
language plpgsql as $$
begin
  raise exception 'product measurement profiles are immutable';
end $$;

create trigger product_measurement_profile_immutable_guard
before update or delete on product_measurement_profile
for each row execute function prevent_product_measurement_profile_rewrite();

create table product_attribute_confirmation (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  sku_id uuid not null,
  revision integer not null check (revision > 0),
  brand text not null check (char_length(brand) between 1 and 160),
  size_label text not null check (char_length(size_label) between 1 and 80),
  color text not null check (char_length(color) between 1 and 80),
  evidence_asset_id uuid not null,
  source_candidate_id uuid,
  supersedes_confirmation_id uuid,
  confirmed_by uuid not null references app_identity(id),
  confirmed_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, id),
  unique (workspace_id, sku_id, revision),
  unique (workspace_id, sku_id, id),
  unique (workspace_id, sku_id, supersedes_confirmation_id),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id),
  foreign key (workspace_id, evidence_asset_id) references media_asset(workspace_id, id),
  foreign key (workspace_id, source_candidate_id)
    references product_identity_candidate(workspace_id, id),
  foreign key (workspace_id, sku_id, supersedes_confirmation_id)
    references product_attribute_confirmation(workspace_id, sku_id, id)
);

create or replace function validate_product_attribute_confirmation_insert() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  evidence_role text;
  source_sku_id uuid;
  candidate_source_asset_id uuid;
  source_status text;
  latest_id uuid;
  latest_revision integer;
begin
  select role into evidence_role
  from public.media_asset
  where workspace_id = new.workspace_id and sku_id = new.sku_id
    and id = new.evidence_asset_id;
  if evidence_role is null or evidence_role not in ('brand_tag', 'care_label') then
    raise exception 'product attributes require same-SKU brand-tag or care-label evidence';
  end if;

  if new.source_candidate_id is not null then
    select sku_id, source_asset_id, status
      into source_sku_id, candidate_source_asset_id, source_status
    from public.product_identity_candidate
    where workspace_id = new.workspace_id and id = new.source_candidate_id;
    if source_sku_id is distinct from new.sku_id
      or candidate_source_asset_id is distinct from new.evidence_asset_id
      or source_status = 'rejected' then
      raise exception 'product attribute source candidate is unavailable';
    end if;
  end if;

  select id, revision into latest_id, latest_revision
  from public.product_attribute_confirmation
  where workspace_id = new.workspace_id and sku_id = new.sku_id
  order by revision desc
  limit 1
  for update;

  if latest_id is null then
    if new.revision <> 1 or new.supersedes_confirmation_id is not null then
      raise exception 'first product attribute confirmation must be revision one';
    end if;
  elsif new.revision <> latest_revision + 1
    or new.supersedes_confirmation_id is distinct from latest_id then
    raise exception 'product attribute confirmation must supersede the latest revision';
  end if;
  return new;
end $$;

create trigger product_attribute_confirmation_insert_guard
before insert on product_attribute_confirmation
for each row execute function validate_product_attribute_confirmation_insert();

create or replace function prevent_product_attribute_confirmation_rewrite() returns trigger
language plpgsql as $$
begin
  raise exception 'product attribute confirmations are append-only';
end $$;

create trigger product_attribute_confirmation_append_only_guard
before update or delete on product_attribute_confirmation
for each row execute function prevent_product_attribute_confirmation_rewrite();

create or replace function validate_pilot_item_insert() returns trigger
language plpgsql as $$
declare
  run_row pilot_run%rowtype;
  existing_count integer;
  expected_template_id text;
begin
  select * into run_row from pilot_run
  where workspace_id = new.workspace_id and id = new.pilot_run_id
  for update;
  if run_row.id is null or run_row.state is distinct from 'active' then
    raise exception 'pilot run is not active';
  end if;
  select count(*)::integer into existing_count from pilot_item_measurement
  where workspace_id = new.workspace_id and pilot_run_id = new.pilot_run_id;
  if existing_count >= 10 then
    raise exception 'pilot run already contains ten products';
  end if;

  if run_row.protocol_version = 'listing_prep_pilot_v1.1.0' then
    expected_template_id := case
      when new.product_fixture_id like 'TOP-%' then 'tops_standard_v1'
      when new.product_fixture_id like 'OUTER-%' then 'outer_standard_v1'
      when new.product_fixture_id like 'PANTS-%' then 'pants_standard_v1'
      when new.product_fixture_id like 'KNIT-%' then 'knit_set_in_v1'
      else null
    end;
    if new.measurement_template_id is distinct from expected_template_id
      or new.measurement_template_version is distinct from 1 then
      raise exception 'pilot fixture measurement template does not match the manifest';
    end if;
  elsif new.measurement_template_id is not null or new.measurement_template_version is not null then
    raise exception 'historical pilot items cannot acquire a v1.1 measurement template';
  end if;
  return new;
end $$;

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
    or old.measurement_template_id is distinct from new.measurement_template_id
    or old.measurement_template_version is distinct from new.measurement_template_version
    or old.started_at <> new.started_at then
    raise exception 'pilot item identity, template and start time are immutable';
  end if;
  if new.completed_at is null then
    raise exception 'pilot item updates must complete the measurement';
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
    or old.fixture_manifest_sha256 is distinct from new.fixture_manifest_sha256
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

alter table product_measurement_profile enable row level security;
alter table product_measurement_profile force row level security;
create policy workspace_isolation on product_measurement_profile
  using (workspace_id = app_workspace_id())
  with check (workspace_id = app_workspace_id());

alter table product_attribute_confirmation enable row level security;
alter table product_attribute_confirmation force row level security;
create policy workspace_isolation on product_attribute_confirmation
  using (workspace_id = app_workspace_id())
  with check (workspace_id = app_workspace_id());

grant select, insert on product_measurement_profile, product_attribute_confirmation
to resale_app_runtime;

comment on table product_measurement_profile is
  'Immutable human-confirmed category and generated measurement-template selection for a SKU.';
comment on table product_attribute_confirmation is
  'Append-only human-confirmed brand, size and color revisions backed by same-SKU tag evidence.';
comment on column product_identity_candidate.color_candidate is
  'Optional color candidate parsed from user-copied OCR text; never auto-confirms product facts.';
comment on constraint pilot_run_protocol_fixture_check on pilot_run is
  'Keeps v1.0 history null and binds every v1.1 run to migration 0033 and the generated manifest hash.';

commit;
