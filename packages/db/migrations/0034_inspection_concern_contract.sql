begin;

alter table media_asset
  add constraint media_asset_workspace_sku_asset_unique
  unique (workspace_id, sku_id, id);

create or replace function can_actor_access_inspection_sku(
  requested_sku_id uuid
) returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with session_context as (
    select
      public.app_workspace_id() as workspace_id,
      public.app_identity_id() as identity_id,
      statement_timestamp() as checked_at
  )
  select
    context.workspace_id is not null
    and context.identity_id is not null
    and exists (
    select 1
    from public.product_sku sku
    join public.workspace_membership membership
      on membership.workspace_id = sku.workspace_id
      and membership.identity_id = context.identity_id
    where sku.workspace_id = context.workspace_id
      and sku.id = requested_sku_id
      and membership.active
      and (
        membership.role in ('owner', 'inventory_manager')
        or (
          membership.role = 'field_worker'
          and public.has_active_sku_work_assignment(
            context.workspace_id,
            context.identity_id,
            'capture',
            requested_sku_id,
            context.checked_at
          )
        )
      )
  )
  from session_context context
$$;

revoke all on function can_actor_access_inspection_sku(uuid) from public;
grant execute on function can_actor_access_inspection_sku(uuid) to resale_app_runtime;

create table inspection_check_result (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  sku_id uuid not null,
  inspection_item_key text not null
    check (inspection_item_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  product_category text not null
    check (product_category ~ '^[a-z][a-z0-9_]{1,63}$'),
  definition_version integer not null check (definition_version between 1 and 1000),
  status text not null
    check (status in ('unconfirmed', 'no_issue_confirmed', 'concern_present')),
  concern_revision_ids uuid[] not null default '{}'::uuid[],
  revision integer not null check (revision between 1 and 10000),
  supersedes_id uuid,
  created_by uuid not null references app_identity(id),
  created_at timestamptz not null default statement_timestamp(),
  recorded_by uuid not null references app_identity(id),
  recorded_at timestamptz not null default statement_timestamp(),
  confirmed_by uuid references app_identity(id),
  confirmed_at timestamptz,
  primary key (workspace_id, id),
  unique (
    workspace_id,
    sku_id,
    inspection_item_key,
    product_category,
    definition_version,
    revision
  ),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id),
  foreign key (workspace_id, supersedes_id)
    references inspection_check_result(workspace_id, id)
    deferrable initially deferred,
  check (
    (status = 'unconfirmed' and confirmed_by is null and confirmed_at is null)
    or (
      status in ('no_issue_confirmed', 'concern_present')
      and confirmed_by is not null
      and confirmed_at is not null
    )
  ),
  check (
    (status in ('unconfirmed', 'no_issue_confirmed') and cardinality(concern_revision_ids) = 0)
    or (
      status = 'concern_present'
      and cardinality(concern_revision_ids) between 1 and 20
    )
  )
);

create unique index inspection_check_result_one_successor
on inspection_check_result(workspace_id, supersedes_id)
where supersedes_id is not null;

create index inspection_check_result_current_lookup
on inspection_check_result(
  workspace_id,
  sku_id,
  product_category,
  definition_version,
  inspection_item_key,
  revision desc
);

create table inspection_concern_revision (
  id uuid not null default gen_random_uuid(),
  concern_id uuid not null,
  workspace_id uuid not null references workspace(id),
  sku_id uuid not null,
  inspection_item_key text not null
    check (inspection_item_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  product_category text not null
    check (product_category ~ '^[a-z][a-z0-9_]{1,63}$'),
  definition_version integer not null check (definition_version between 1 and 1000),
  revision integer not null check (revision between 1 and 10000),
  supersedes_id uuid,
  item_location text not null check (char_length(btrim(item_location)) between 1 and 120),
  concern_type text not null
    check (concern_type in ('stain', 'scratch', 'pilling', 'fray', 'fade', 'peel', 'odor', 'other')),
  severity text not null check (severity in ('small', 'noticeable', 'affects_use')),
  marker_source_asset_id uuid,
  marker_x numeric(7,6) check (marker_x between 0 and 1),
  marker_y numeric(7,6) check (marker_y between 0 and 1),
  context_evidence_asset_id uuid,
  detail_evidence_asset_id uuid,
  memo text check (
    memo is null
    or (memo = btrim(memo) and char_length(memo) between 1 and 500)
  ),
  review_state text not null
    check (
      review_state in (
        'draft', 'pending_review', 'human_confirmed', 'changes_requested', 'human_dismissed'
      )
    ),
  created_by uuid not null references app_identity(id),
  created_at timestamptz not null default statement_timestamp(),
  recorded_by uuid not null references app_identity(id),
  recorded_at timestamptz not null default statement_timestamp(),
  reviewed_by uuid references app_identity(id),
  reviewed_at timestamptz,
  primary key (workspace_id, id),
  unique (workspace_id, concern_id, revision),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id),
  foreign key (workspace_id, supersedes_id)
    references inspection_concern_revision(workspace_id, id)
    deferrable initially deferred,
  foreign key (workspace_id, sku_id, marker_source_asset_id)
    references media_asset(workspace_id, sku_id, id),
  foreign key (workspace_id, sku_id, context_evidence_asset_id)
    references media_asset(workspace_id, sku_id, id),
  foreign key (workspace_id, sku_id, detail_evidence_asset_id)
    references media_asset(workspace_id, sku_id, id),
  check (
    (marker_source_asset_id is null and marker_x is null and marker_y is null)
    or (marker_source_asset_id is not null and marker_x is not null and marker_y is not null)
  ),
  check (
    concern_type = 'odor'
    or (marker_source_asset_id is not null and context_evidence_asset_id is not null)
  ),
  check (
    marker_source_asset_id is not null
    or context_evidence_asset_id is not null
    or detail_evidence_asset_id is not null
    or (concern_type = 'odor' and memo is not null)
  ),
  check (
    (review_state in ('draft', 'pending_review') and reviewed_by is null and reviewed_at is null)
    or (
      review_state in ('human_confirmed', 'changes_requested', 'human_dismissed')
      and reviewed_by is not null
      and reviewed_at is not null
    )
  ),
  check (concern_type <> 'odor' or memo is not null)
);

create unique index inspection_concern_one_successor
on inspection_concern_revision(workspace_id, supersedes_id)
where supersedes_id is not null;

create index inspection_concern_current_lookup
on inspection_concern_revision(workspace_id, sku_id, concern_id, revision desc);

create or replace function validate_inspection_check_result_revision() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := public.app_identity_id();
  prior public.inspection_check_result%rowtype;
  distinct_concern_count integer;
begin
  if actor_id is null
    or new.recorded_by is distinct from actor_id
    or not public.can_actor_access_inspection_sku(new.sku_id) then
    raise exception 'the session actor cannot record this SKU inspection'
      using errcode = '42501';
  end if;

  perform 1
  from public.product_sku sku
  where sku.workspace_id = new.workspace_id and sku.id = new.sku_id
  for update;
  if not found then
    raise exception 'inspection check SKU does not exist in this workspace'
      using errcode = '23503';
  end if;

  new.recorded_at := statement_timestamp();

  if new.revision = 1 then
    if new.supersedes_id is not null or new.created_by is distinct from actor_id then
      raise exception 'the first inspection check revision must be created by the session actor';
    end if;
    new.created_at := new.recorded_at;
  else
    if new.supersedes_id is null then
      raise exception 'a later inspection check revision must supersede its immediate predecessor';
    end if;
    select * into prior
    from public.inspection_check_result previous
    where previous.workspace_id = new.workspace_id and previous.id = new.supersedes_id
    for key share;
    if prior.id is null
      or prior.sku_id is distinct from new.sku_id
      or prior.inspection_item_key is distinct from new.inspection_item_key
      or prior.product_category is distinct from new.product_category
      or prior.definition_version is distinct from new.definition_version
      or prior.revision + 1 <> new.revision then
      raise exception 'inspection check revision does not follow its predecessor';
    end if;
    new.created_by := prior.created_by;
    new.created_at := prior.created_at;
  end if;

  if new.status = 'unconfirmed' then
    if new.confirmed_by is not null or new.confirmed_at is not null then
      raise exception 'an unconfirmed inspection check cannot contain confirmation metadata';
    end if;
  else
    if new.revision <= 1 or prior.id is null or prior.status <> 'unconfirmed' then
      raise exception 'a confirmed inspection check must directly supersede an unconfirmed revision'
        using errcode = '23514';
    end if;
    if actor_id = prior.recorded_by then
      raise exception 'an inspection check reviewer must differ from the prior revision recorder'
        using errcode = '42501';
    end if;
    if new.confirmed_by is distinct from actor_id then
      raise exception 'the inspection check reviewer must be the session actor'
        using errcode = '42501';
    end if;
    new.confirmed_at := new.recorded_at;
  end if;

  select count(distinct concern_revision_id)::integer into distinct_concern_count
  from unnest(new.concern_revision_ids) concern_revision_id;
  if distinct_concern_count <> cardinality(new.concern_revision_ids) then
    raise exception 'inspection concern revision IDs must not contain duplicates'
      using errcode = '23505';
  end if;

  return new;
end $$;

create trigger inspection_check_result_revision_guard
before insert on inspection_check_result
for each row execute function validate_inspection_check_result_revision();

create or replace function validate_inspection_concern_revision() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := public.app_identity_id();
  prior public.inspection_concern_revision%rowtype;
begin
  if actor_id is null
    or new.recorded_by is distinct from actor_id
    or not public.can_actor_access_inspection_sku(new.sku_id) then
    raise exception 'the session actor cannot record this SKU concern'
      using errcode = '42501';
  end if;

  perform 1
  from public.product_sku sku
  where sku.workspace_id = new.workspace_id and sku.id = new.sku_id
  for update;
  if not found then
    raise exception 'concern SKU does not exist in this workspace'
      using errcode = '23503';
  end if;

  new.recorded_at := statement_timestamp();

  if new.revision = 1 then
    if new.supersedes_id is not null or new.created_by is distinct from actor_id then
      raise exception 'the first concern revision must be created by the session actor';
    end if;
    new.created_at := new.recorded_at;
  else
    if new.supersedes_id is null then
      raise exception 'a later concern revision must supersede its immediate predecessor';
    end if;
    select * into prior
    from public.inspection_concern_revision previous
    where previous.workspace_id = new.workspace_id and previous.id = new.supersedes_id
    for key share;
    if prior.id is null
      or prior.concern_id is distinct from new.concern_id
      or prior.sku_id is distinct from new.sku_id
      or prior.inspection_item_key is distinct from new.inspection_item_key
      or prior.product_category is distinct from new.product_category
      or prior.definition_version is distinct from new.definition_version
      or prior.revision + 1 <> new.revision then
      raise exception 'concern revision does not follow its predecessor';
    end if;
    if prior.review_state = 'human_dismissed' then
      raise exception 'a human-dismissed concern chain is terminal and cannot be reopened'
        using errcode = '23514';
    end if;
    new.created_by := prior.created_by;
    new.created_at := prior.created_at;
  end if;

  if new.review_state in ('draft', 'pending_review') then
    if new.reviewed_by is not null or new.reviewed_at is not null then
      raise exception 'an unreviewed concern cannot contain reviewer metadata';
    end if;
  else
    if new.revision <= 1 or prior.id is null or prior.review_state <> 'pending_review' then
      raise exception 'a concern review must directly supersede a pending-review revision'
        using errcode = '23514';
    end if;
    if new.item_location is distinct from prior.item_location
      or new.concern_type is distinct from prior.concern_type
      or new.severity is distinct from prior.severity
      or new.marker_source_asset_id is distinct from prior.marker_source_asset_id
      or new.marker_x is distinct from prior.marker_x
      or new.marker_y is distinct from prior.marker_y
      or new.context_evidence_asset_id is distinct from prior.context_evidence_asset_id
      or new.detail_evidence_asset_id is distinct from prior.detail_evidence_asset_id
      or new.memo is distinct from prior.memo then
      raise exception 'a concern review cannot change the submitted concern content'
        using errcode = '23514';
    end if;
    if actor_id = prior.recorded_by then
      raise exception 'a concern reviewer must differ from the prior revision recorder'
        using errcode = '42501';
    end if;
    if new.reviewed_by is distinct from actor_id then
      raise exception 'the concern reviewer must be the session actor'
        using errcode = '42501';
    end if;
    new.reviewed_at := new.recorded_at;
  end if;

  return new;
end $$;

create trigger inspection_concern_revision_guard
before insert on inspection_concern_revision
for each row execute function validate_inspection_concern_revision();

create or replace function validate_inspection_context_current_state() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  latest_check public.inspection_check_result%rowtype;
  latest_concern_count integer;
  active_concern_count integer;
  confirmed_concern_count integer;
  dismissed_concern_count integer;
  valid_reference_count integer;
begin
  perform 1
  from public.product_sku sku
  where sku.workspace_id = new.workspace_id and sku.id = new.sku_id
  for update;
  if not found then
    raise exception 'inspection context SKU does not exist in this workspace'
      using errcode = '23503';
  end if;

  select check_result.* into latest_check
  from public.inspection_check_result check_result
  where check_result.workspace_id = new.workspace_id
    and check_result.sku_id = new.sku_id
    and check_result.inspection_item_key = new.inspection_item_key
    and check_result.product_category = new.product_category
    and check_result.definition_version = new.definition_version
    and not exists (
      select 1
      from public.inspection_check_result successor
      where successor.workspace_id = check_result.workspace_id
        and successor.supersedes_id = check_result.id
    )
  order by check_result.revision desc
  limit 1;

  select
    count(*)::integer,
    count(*) filter (
      where concern.review_state <> 'human_dismissed'
    )::integer,
    count(*) filter (
      where concern.review_state = 'human_confirmed'
    )::integer,
    count(*) filter (
      where concern.review_state = 'human_dismissed'
    )::integer
  into
    latest_concern_count,
    active_concern_count,
    confirmed_concern_count,
    dismissed_concern_count
  from public.inspection_concern_revision concern
  where concern.workspace_id = new.workspace_id
    and concern.sku_id = new.sku_id
    and concern.inspection_item_key = new.inspection_item_key
    and concern.product_category = new.product_category
    and concern.definition_version = new.definition_version
    and not exists (
      select 1
      from public.inspection_concern_revision successor
      where successor.workspace_id = concern.workspace_id
        and successor.supersedes_id = concern.id
    );

  if latest_check.id is null then
    if active_concern_count > 0 then
      raise exception 'an active inspection concern requires a latest inspection check revision'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if latest_check.status = 'unconfirmed' then
    return new;
  end if;

  if latest_check.status = 'concern_present' then
    select count(*)::integer into valid_reference_count
    from public.inspection_concern_revision concern
    where concern.workspace_id = latest_check.workspace_id
      and concern.sku_id = latest_check.sku_id
      and concern.inspection_item_key = latest_check.inspection_item_key
      and concern.product_category = latest_check.product_category
      and concern.definition_version = latest_check.definition_version
      and concern.review_state = 'human_confirmed'
      and concern.id = any(latest_check.concern_revision_ids);
    if valid_reference_count <> cardinality(latest_check.concern_revision_ids) then
      raise exception 'concern-present checks may reference only human-confirmed revisions from the same inspection context'
        using errcode = '23503';
    end if;
    if latest_concern_count = 0
      or confirmed_concern_count <> latest_concern_count
      or cardinality(latest_check.concern_revision_ids) <> latest_concern_count
      or exists (
        select 1
        from public.inspection_concern_revision concern
        where concern.workspace_id = latest_check.workspace_id
          and concern.sku_id = latest_check.sku_id
          and concern.inspection_item_key = latest_check.inspection_item_key
          and concern.product_category = latest_check.product_category
          and concern.definition_version = latest_check.definition_version
          and not exists (
            select 1
            from public.inspection_concern_revision successor
            where successor.workspace_id = concern.workspace_id
              and successor.supersedes_id = concern.id
          )
          and not (concern.id = any(latest_check.concern_revision_ids))
      ) then
      raise exception 'concern-present checks must reference the exact complete set of latest human-confirmed concern revisions'
        using errcode = '23514';
    end if;
  elsif latest_check.status = 'no_issue_confirmed'
    and dismissed_concern_count <> latest_concern_count then
    raise exception 'no-issue confirmation requires every latest concern revision to be human-dismissed'
      using errcode = '23514';
  end if;

  return new;
end $$;

create constraint trigger inspection_check_result_current_state_guard
after insert on inspection_check_result
deferrable initially deferred
for each row execute function validate_inspection_context_current_state();

create constraint trigger inspection_concern_current_state_guard
after insert on inspection_concern_revision
deferrable initially deferred
for each row execute function validate_inspection_context_current_state();

create or replace function reject_inspection_history_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'inspection history is append-only; create a successor revision';
end $$;

create trigger inspection_check_result_append_only
before update or delete on inspection_check_result
for each row execute function reject_inspection_history_mutation();

create trigger inspection_concern_append_only
before update or delete on inspection_concern_revision
for each row execute function reject_inspection_history_mutation();

alter table inspection_check_result enable row level security;
alter table inspection_check_result force row level security;
create policy inspection_check_result_actor_access on inspection_check_result
  using (
    workspace_id = app_workspace_id()
    and can_actor_access_inspection_sku(sku_id)
  )
  with check (
    workspace_id = app_workspace_id()
    and can_actor_access_inspection_sku(sku_id)
  );

alter table inspection_concern_revision enable row level security;
alter table inspection_concern_revision force row level security;
create policy inspection_concern_actor_access on inspection_concern_revision
  using (
    workspace_id = app_workspace_id()
    and can_actor_access_inspection_sku(sku_id)
  )
  with check (
    workspace_id = app_workspace_id()
    and can_actor_access_inspection_sku(sku_id)
  );

grant select, insert on inspection_check_result, inspection_concern_revision
to resale_app_runtime;
revoke update, delete on inspection_check_result, inspection_concern_revision
from resale_app_runtime;

revoke all on function validate_inspection_check_result_revision() from public;
revoke all on function validate_inspection_concern_revision() from public;
revoke all on function validate_inspection_context_current_state() from public;
revoke all on function reject_inspection_history_mutation() from public;

comment on table inspection_check_result is
  'Append-only human inspection decisions. created_by is the first chain author, recorded_by is each revision author, and confirmed_by is the actor reviewing the immediately prior unconfirmed revision.';
comment on table inspection_concern_revision is
  'Append-only structured concern history. created_by is the first chain author, recorded_by is each revision author, and reviewed_by is the actor reviewing the immediately prior pending revision without changing its content. draft, pending_review, changes_requested, and human_confirmed remain active; only terminal human_dismissed resolves a concern and it cannot be reopened. Private storage keys are never published.';
comment on column inspection_check_result.concern_revision_ids is
  'Exact immutable complete set of latest same-context human-confirmed concern revision IDs; no media storage data is included.';
comment on column inspection_concern_revision.marker_x is
  'Horizontal marker coordinate normalized to the inclusive range 0 through 1.';
comment on column inspection_concern_revision.marker_y is
  'Vertical marker coordinate normalized to the inclusive range 0 through 1.';

commit;
