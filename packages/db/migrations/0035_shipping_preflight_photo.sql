begin;

create or replace function can_actor_access_shipping_order(target_order_id uuid) returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.sales_order orders
    join public.workspace_membership membership
      on membership.workspace_id = orders.workspace_id
     and membership.identity_id = public.app_identity_id()
     and membership.active
    where orders.workspace_id = public.app_workspace_id()
      and orders.id = target_order_id
      and orders.state <> 'cancelled'
      and (
        membership.role in ('owner', 'inventory_manager')
        or (
          membership.role = 'shipping'
          and exists (
            select 1
            from public.order_assignment assignment
            where assignment.workspace_id = orders.workspace_id
              and assignment.order_id = orders.id
              and assignment.identity_id = membership.identity_id
              and assignment.revoked_at is null
              and assignment.starts_at <= statement_timestamp()
              and assignment.expires_at > statement_timestamp()
          )
        )
      )
  )
$$;

revoke all on function can_actor_access_shipping_order(uuid) from public;
grant execute on function can_actor_access_shipping_order(uuid) to resale_app_runtime;

create or replace function lock_current_shipping_workspace() returns boolean
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare
  current_workspace_id uuid := public.app_workspace_id();
  current_identity_id uuid := public.app_identity_id();
  locked boolean;
begin
  if current_workspace_id is null or current_identity_id is null then
    raise exception 'shipping workspace lock requires a session actor'
      using errcode = '42501';
  end if;

  select true
  into locked
  from public.workspace workspace_row
  where workspace_row.id = current_workspace_id
    and exists (
      select 1
      from public.workspace_membership membership
      where membership.workspace_id = workspace_row.id
        and membership.identity_id = current_identity_id
        and membership.active
    )
  for update of workspace_row;

  if locked is distinct from true then
    raise exception 'shipping workspace lock requires an active membership'
      using errcode = '42501';
  end if;

  return true;
end
$$;

comment on function lock_current_shipping_workspace() is
  'Locks only app_workspace_id() after app_identity_id() active-membership verification; caller-supplied workspace, identity, and time probes are impossible.';

revoke all on function lock_current_shipping_workspace() from public;
grant execute on function lock_current_shipping_workspace() to resale_app_runtime;

create table shipping_photo_policy_revision (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  mode text not null check (mode in ('high_value_only', 'all', 'disabled')),
  high_value_threshold_minor bigint,
  revision integer not null check (revision between 1 and 10000),
  supersedes_id uuid,
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  changed_by uuid not null references app_identity(id),
  changed_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, id),
  unique (workspace_id, revision),
  unique (workspace_id, idempotency_key),
  foreign key (workspace_id, supersedes_id)
    references shipping_photo_policy_revision(workspace_id, id)
    deferrable initially deferred,
  check (
    (mode = 'high_value_only' and high_value_threshold_minor between 1 and 100000000)
    or (mode in ('all', 'disabled') and high_value_threshold_minor is null)
  )
);

create unique index shipping_photo_policy_one_successor
on shipping_photo_policy_revision(workspace_id, supersedes_id)
where supersedes_id is not null;

create table shipping_sale_basis_snapshot (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  order_id uuid not null,
  active_sale_event_ids uuid[] not null,
  active_sale_total_minor bigint,
  source_set_sha256 text not null check (source_set_sha256 ~ '^[a-f0-9]{64}$'),
  captured_by uuid not null references app_identity(id),
  captured_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, id),
  unique (workspace_id, order_id, id),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id),
  check (
    (cardinality(active_sale_event_ids) = 0 and active_sale_total_minor is null)
    or (
      cardinality(active_sale_event_ids) > 0
      and active_sale_total_minor between 1 and 9223372036854775807
    )
  )
);

create table order_shipping_photo_decision (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  order_id uuid not null,
  policy_revision_id uuid,
  sale_basis_id uuid not null,
  sale_event_id uuid,
  sale_amount_state text not null check (sale_amount_state in ('present', 'missing')),
  decision_reason text not null check (
    decision_reason in (
      'policy_missing', 'policy_all', 'policy_disabled', 'threshold_met',
      'threshold_below', 'sale_amount_missing', 'manual_use', 'manual_skip'
    )
  ),
  override_choice text check (override_choice in ('use_photos', 'skip_photos')),
  decision_state text not null check (
    decision_state in ('choice_required', 'capture_required', 'satisfied_without_photo')
  ),
  photo_required boolean,
  revision integer not null check (revision between 1 and 10000),
  supersedes_id uuid,
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  decided_by uuid not null references app_identity(id),
  decided_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, id),
  unique (workspace_id, order_id, revision),
  unique (workspace_id, order_id, idempotency_key),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id),
  foreign key (workspace_id, policy_revision_id)
    references shipping_photo_policy_revision(workspace_id, id),
  foreign key (workspace_id, order_id, sale_basis_id)
    references shipping_sale_basis_snapshot(workspace_id, order_id, id),
  foreign key (workspace_id, sale_event_id) references financial_event(workspace_id, id),
  foreign key (workspace_id, supersedes_id)
    references order_shipping_photo_decision(workspace_id, id)
    deferrable initially deferred,
  check (
    (decision_state = 'choice_required' and photo_required is null)
    or (decision_state = 'capture_required' and photo_required is true)
    or (decision_state = 'satisfied_without_photo' and photo_required is false)
  )
);

create unique index order_shipping_photo_decision_one_successor
on order_shipping_photo_decision(workspace_id, supersedes_id)
where supersedes_id is not null;

create index order_shipping_photo_decision_current_lookup
on order_shipping_photo_decision(workspace_id, order_id, revision desc);

create table shipping_photo_asset (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  order_id uuid not null,
  sku_id uuid not null,
  role text not null check (role in ('product', 'packed_package')),
  original_sha256 text not null check (original_sha256 ~ '^[a-f0-9]{64}$'),
  original_storage_key text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  width integer not null check (width between 1 and 12000),
  height integer not null check (height between 1 and 12000),
  upload_idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  captured_by uuid not null references app_identity(id),
  captured_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, id),
  unique (workspace_id, original_storage_key),
  unique (workspace_id, order_id, upload_idempotency_key),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id)
);

create index shipping_photo_asset_order_lookup
on shipping_photo_asset(workspace_id, order_id, captured_at, id);

create table shipping_photo_confirmation (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  order_id uuid not null,
  decision_id uuid not null,
  asset_ids uuid[] not null,
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  confirmed_by uuid not null references app_identity(id),
  confirmed_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, id),
  unique (workspace_id, order_id, idempotency_key),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id),
  foreign key (workspace_id, decision_id)
    references order_shipping_photo_decision(workspace_id, id),
  check (cardinality(asset_ids) between 2 and 100)
);

create index shipping_photo_confirmation_order_lookup
on shipping_photo_confirmation(workspace_id, order_id, confirmed_at desc, id);

create table shipment_human_confirmation (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  order_id uuid not null,
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  confirmed_by uuid not null references app_identity(id),
  confirmed_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, id),
  unique (workspace_id, order_id),
  unique (workspace_id, order_id, idempotency_key),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id)
);

alter table packing_evidence
  add column server_confirmed boolean not null default false;

alter table packing_evidence
  drop constraint packing_evidence_workspace_id_order_id_key;

create unique index packing_evidence_one_legacy_per_order
on packing_evidence(workspace_id, order_id)
where not server_confirmed;

create unique index packing_evidence_one_server_confirmation_per_order
on packing_evidence(workspace_id, order_id)
where server_confirmed;

create or replace function collect_shipping_sale_basis(
  target_workspace_id uuid,
  target_order_id uuid
) returns table (
  active_sale_event_ids uuid[],
  active_sale_count integer,
  active_sale_total numeric,
  non_jpy_count integer,
  nonpositive_count integer,
  source_set_sha256 text
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with active_sales as (
    select event.id, event.sku_id, event.order_id, event.amount_minor,
           btrim(event.currency) as currency, event.tax_basis, event.bearer,
           event.source, event.source_meaning, event.rounding_rule_version,
           event.source_already_net, event.occurred_at
    from public.financial_event event
    where event.workspace_id = target_workspace_id
      and event.order_id = target_order_id
      and event.event_type = 'sale'
      and event.reverses_event_id is null
      and not exists (
        select 1
        from public.financial_event reversal
        where reversal.workspace_id = event.workspace_id
          and reversal.reverses_event_id = event.id
      )
  )
  select coalesce(array_agg(event.id order by event.id), '{}'::uuid[]),
         count(*)::integer,
         sum(event.amount_minor),
         count(*) filter (where event.currency <> 'JPY')::integer,
         count(*) filter (where event.amount_minor <= 0)::integer,
         encode(
           digest(
             coalesce(
               string_agg(
                 jsonb_build_object(
                   'id', event.id,
                   'skuId', event.sku_id,
                   'orderId', event.order_id,
                   'amountMinor', event.amount_minor,
                   'currency', event.currency,
                   'taxBasis', event.tax_basis,
                   'bearer', event.bearer,
                   'source', event.source,
                   'sourceMeaning', event.source_meaning,
                   'roundingRuleVersion', event.rounding_rule_version,
                   'sourceAlreadyNet', event.source_already_net,
                   'occurredAt', extract(epoch from event.occurred_at)
                 )::text,
                 E'\n' order by event.id
               ),
               ''
             ),
             'sha256'
           ),
           'hex'
         )
  from active_sales event
$$;

create or replace function shipping_sale_basis_snapshot_is_current(
  target_workspace_id uuid,
  target_order_id uuid,
  target_basis_id uuid
) returns boolean
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  snapshot public.shipping_sale_basis_snapshot%rowtype;
  current_basis record;
  current_total bigint;
begin
  select basis.* into snapshot
  from public.shipping_sale_basis_snapshot basis
  where basis.workspace_id = target_workspace_id
    and basis.order_id = target_order_id
    and basis.id = target_basis_id;
  if snapshot.id is null then return false; end if;

  select * into current_basis
  from public.collect_shipping_sale_basis(target_workspace_id, target_order_id);
  if current_basis.non_jpy_count <> 0
    or current_basis.nonpositive_count <> 0
    or (
      current_basis.active_sale_count > 0
      and (
        current_basis.active_sale_total is null
        or current_basis.active_sale_total > 9223372036854775807::numeric
      )
    ) then
    return false;
  end if;
  current_total := case
    when current_basis.active_sale_count = 0 then null
    else current_basis.active_sale_total::bigint
  end;
  return snapshot.active_sale_event_ids = current_basis.active_sale_event_ids
    and snapshot.active_sale_total_minor is not distinct from current_total
    and snapshot.source_set_sha256 = current_basis.source_set_sha256;
end
$$;

create or replace function current_actor_shipping_sale_basis_is_current(
  target_order_id uuid,
  target_basis_id uuid
) returns boolean
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select public.can_actor_access_shipping_order(target_order_id)
    and public.shipping_sale_basis_snapshot_is_current(
      public.app_workspace_id(), target_order_id, target_basis_id
    )
$$;

create or replace function lock_shipping_sale_basis_on_financial_event() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  basis_order_id uuid;
begin
  if new.event_type = 'sale' and new.reverses_event_id is null then
    basis_order_id := new.order_id;
  elsif new.reverses_event_id is not null then
    select original.order_id into basis_order_id
    from public.financial_event original
    where original.workspace_id = new.workspace_id
      and original.id = new.reverses_event_id
      and original.event_type = 'sale';
  end if;

  if basis_order_id is not null then
    perform 1 from public.sales_order orders
    where orders.workspace_id = new.workspace_id and orders.id = basis_order_id
    for update;
    if not found then
      raise exception 'shipping sale basis order is unavailable' using errcode = '23503';
    end if;
  end if;
  return new;
end
$$;

create trigger financial_event_shipping_sale_basis_lock
before insert on financial_event
for each row execute function lock_shipping_sale_basis_on_financial_event();

create or replace function validate_shipping_photo_policy_revision() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := public.app_identity_id();
  prior public.shipping_photo_policy_revision%rowtype;
begin
  if actor_id is null or new.workspace_id is distinct from public.app_workspace_id()
    or not exists (
      select 1 from public.workspace_membership membership
      where membership.workspace_id = new.workspace_id
        and membership.identity_id = actor_id
        and membership.active
        and membership.role = 'owner'
    ) then
    raise exception 'only an active workspace owner may change shipping photo policy'
      using errcode = '42501';
  end if;

  perform 1 from public.workspace where id = new.workspace_id for update;
  if not found then
    raise exception 'shipping photo policy workspace does not exist' using errcode = '23503';
  end if;

  if new.revision = 1 then
    if new.supersedes_id is not null or exists (
      select 1 from public.shipping_photo_policy_revision policy
      where policy.workspace_id = new.workspace_id
    ) then
      raise exception 'the first shipping photo policy revision must start an empty chain'
        using errcode = '23514';
    end if;
  else
    select * into prior
    from public.shipping_photo_policy_revision policy
    where policy.workspace_id = new.workspace_id and policy.id = new.supersedes_id
    for key share;
    if prior.id is null or prior.revision + 1 <> new.revision
      or exists (
        select 1 from public.shipping_photo_policy_revision successor
        where successor.workspace_id = prior.workspace_id
          and successor.supersedes_id = prior.id
      ) then
      raise exception 'shipping photo policy must supersede the latest immediate revision'
        using errcode = '23514';
    end if;
  end if;

  new.changed_by := actor_id;
  new.changed_at := statement_timestamp();
  return new;
end $$;

create trigger shipping_photo_policy_revision_guard
before insert on shipping_photo_policy_revision
for each row execute function validate_shipping_photo_policy_revision();

create or replace function validate_order_shipping_photo_decision() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := public.app_identity_id();
  prior public.order_shipping_photo_decision%rowtype;
  replay public.order_shipping_photo_decision%rowtype;
  latest_policy public.shipping_photo_policy_revision%rowtype;
  sale_basis record;
  sale_basis_id uuid;
  sale_basis_total bigint;
  order_state text;
begin
  if actor_id is null or new.workspace_id is distinct from public.app_workspace_id()
    or not public.can_actor_access_shipping_order(new.order_id) then
    raise exception 'the session actor cannot decide shipping photos for this order'
      using errcode = '42501';
  end if;

  perform 1 from public.workspace where id = new.workspace_id for update;
  select orders.state into order_state
  from public.sales_order orders
  where orders.workspace_id = new.workspace_id and orders.id = new.order_id
  for update;
  if not found then
    raise exception 'shipping photo decision order is unavailable' using errcode = '23503';
  end if;

  select decision.* into replay
  from public.order_shipping_photo_decision decision
  where decision.workspace_id = new.workspace_id
    and decision.order_id = new.order_id
    and decision.idempotency_key = new.idempotency_key;
  if replay.id is not null then
    if replay.payload_hash is distinct from new.payload_hash then
      raise exception 'shipping photo decision idempotency key has another payload'
        using errcode = '23505';
    end if;
    return null;
  end if;

  if order_state not in ('confirmed', 'picking', 'packed') then
    raise exception 'shipping photo decision order is unavailable' using errcode = '23503';
  end if;

  if new.revision = 1 then
    if new.supersedes_id is not null or exists (
      select 1 from public.order_shipping_photo_decision decision
      where decision.workspace_id = new.workspace_id and decision.order_id = new.order_id
    ) then
      raise exception 'the first order shipping photo decision must start an empty chain'
        using errcode = '23514';
    end if;
  else
    select * into prior
    from public.order_shipping_photo_decision decision
    where decision.workspace_id = new.workspace_id and decision.id = new.supersedes_id
    for key share;
    if prior.id is null or prior.order_id is distinct from new.order_id
      or prior.revision + 1 <> new.revision
      or exists (
        select 1 from public.order_shipping_photo_decision successor
        where successor.workspace_id = prior.workspace_id
          and successor.supersedes_id = prior.id
      ) then
      raise exception 'order shipping photo decision must supersede the latest immediate revision'
        using errcode = '23514';
    end if;
  end if;

  select policy.* into latest_policy
  from public.shipping_photo_policy_revision policy
  where policy.workspace_id = new.workspace_id
    and not exists (
      select 1 from public.shipping_photo_policy_revision successor
      where successor.workspace_id = policy.workspace_id
        and successor.supersedes_id = policy.id
    )
  order by policy.revision desc
  limit 1;

  select * into sale_basis
  from public.collect_shipping_sale_basis(new.workspace_id, new.order_id);
  if sale_basis.non_jpy_count <> 0 then
    raise exception 'shipping sale basis requires JPY sale events'
      using errcode = '23514';
  end if;
  if sale_basis.nonpositive_count <> 0 then
    raise exception 'shipping sale basis requires positive sale amounts'
      using errcode = '23514';
  end if;
  if sale_basis.active_sale_count > 0 and (
    sale_basis.active_sale_total is null
    or sale_basis.active_sale_total > 9223372036854775807::numeric
  ) then
    raise exception 'shipping sale basis total is outside the supported integer range'
      using errcode = '23514';
  end if;
  sale_basis_total := case
    when sale_basis.active_sale_count = 0 then null
    else sale_basis.active_sale_total::bigint
  end;
  insert into public.shipping_sale_basis_snapshot (
    workspace_id, order_id, active_sale_event_ids, active_sale_total_minor,
    source_set_sha256, captured_by
  ) values (
    new.workspace_id, new.order_id, sale_basis.active_sale_event_ids,
    sale_basis_total, sale_basis.source_set_sha256, actor_id
  ) returning id into sale_basis_id;

  new.policy_revision_id := latest_policy.id;
  new.sale_basis_id := sale_basis_id;
  new.sale_event_id := case
    when sale_basis.active_sale_count = 1 then sale_basis.active_sale_event_ids[1]
    else null
  end;
  new.sale_amount_state := case
    when sale_basis.active_sale_count = 0 then 'missing'
    else 'present'
  end;
  if new.override_choice is not null and not (
    latest_policy.id is null
    or (
      latest_policy.mode = 'high_value_only'
      and sale_basis.active_sale_count = 0
    )
  ) then
    raise exception 'shipping photo override is allowed only when policy or sale amount is missing'
      using errcode = '23514';
  end if;
  if new.override_choice = 'use_photos' then
    new.decision_reason := 'manual_use';
    new.decision_state := 'capture_required';
    new.photo_required := true;
  elsif new.override_choice = 'skip_photos' then
    new.decision_reason := 'manual_skip';
    new.decision_state := 'satisfied_without_photo';
    new.photo_required := false;
  elsif latest_policy.id is null then
    new.decision_reason := 'policy_missing';
    new.decision_state := 'choice_required';
    new.photo_required := null;
  elsif latest_policy.mode = 'all' then
    new.decision_reason := 'policy_all';
    new.decision_state := 'capture_required';
    new.photo_required := true;
  elsif latest_policy.mode = 'disabled' then
    new.decision_reason := 'policy_disabled';
    new.decision_state := 'satisfied_without_photo';
    new.photo_required := false;
  elsif sale_basis.active_sale_count = 0 then
    new.decision_reason := 'sale_amount_missing';
    new.decision_state := 'choice_required';
    new.photo_required := null;
  elsif sale_basis_total >= latest_policy.high_value_threshold_minor then
    new.decision_reason := 'threshold_met';
    new.decision_state := 'capture_required';
    new.photo_required := true;
  else
    new.decision_reason := 'threshold_below';
    new.decision_state := 'satisfied_without_photo';
    new.photo_required := false;
  end if;

  new.decided_by := actor_id;
  new.decided_at := statement_timestamp();
  return new;
end $$;

create trigger order_shipping_photo_decision_guard
before insert on order_shipping_photo_decision
for each row execute function validate_order_shipping_photo_decision();

create or replace function validate_shipping_photo_asset() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := public.app_identity_id();
  allocation_count integer;
  allocated_sku_id uuid;
  asset_count integer;
  latest_decision public.order_shipping_photo_decision%rowtype;
  expected_extension text;
begin
  if actor_id is null or new.workspace_id is distinct from public.app_workspace_id()
    or not public.can_actor_access_shipping_order(new.order_id) then
    raise exception 'the session actor cannot add shipping photos to this order'
      using errcode = '42501';
  end if;

  perform 1 from public.sales_order orders
  where orders.workspace_id = new.workspace_id and orders.id = new.order_id
    and orders.state in ('confirmed', 'picking', 'packed')
  for update;
  if not found then
    raise exception 'shipping photo order is not awaiting packing' using errcode = '23514';
  end if;

  select count(*)::integer into asset_count
  from public.shipping_photo_asset asset
  where asset.workspace_id = new.workspace_id and asset.order_id = new.order_id;
  if asset_count >= 100 then
    raise exception 'shipping photo orders accept at most 100 immutable assets'
      using errcode = '23514';
  end if;

  select count(*)::integer, (array_agg(unit.sku_id))[1]
  into allocation_count, allocated_sku_id
  from public.order_allocation allocation
  join public.inventory_unit unit
    on unit.workspace_id = allocation.workspace_id and unit.id = allocation.inventory_unit_id
  where allocation.workspace_id = new.workspace_id and allocation.order_id = new.order_id
    and allocation.active;
  if allocation_count <> 1 or allocated_sku_id is null then
    raise exception 'shipping photo requires exactly one active allocated SKU'
      using errcode = '23514';
  end if;

  select decision.* into latest_decision
  from public.order_shipping_photo_decision decision
  where decision.workspace_id = new.workspace_id and decision.order_id = new.order_id
    and not exists (
      select 1 from public.order_shipping_photo_decision successor
      where successor.workspace_id = decision.workspace_id
        and successor.supersedes_id = decision.id
    )
  order by decision.revision desc
  limit 1;
  if latest_decision.id is null or latest_decision.photo_required is distinct from true
    or not public.shipping_sale_basis_snapshot_is_current(
      new.workspace_id, new.order_id, latest_decision.sale_basis_id
    ) then
    raise exception 'shipping photos require a latest photo-required order decision'
      using errcode = '23514';
  end if;

  new.sku_id := allocated_sku_id;
  new.captured_by := actor_id;
  new.captured_at := statement_timestamp();
  expected_extension := case when new.mime_type = 'image/jpeg' then 'jpg' else 'png' end;
  new.original_storage_key := format(
    'workspaces/%s/originals/shipping-%s-%s.%s',
    new.workspace_id, new.order_id, new.id, expected_extension
  );
  return new;
end $$;

create trigger shipping_photo_asset_guard
before insert on shipping_photo_asset
for each row execute function validate_shipping_photo_asset();

create or replace function validate_shipping_photo_confirmation() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := public.app_identity_id();
  latest_decision public.order_shipping_photo_decision%rowtype;
  submitted_ids uuid[];
  current_ids uuid[];
  submitted_count integer;
  submitted_distinct_count integer;
  product_count integer;
  packed_count integer;
begin
  if actor_id is null or new.workspace_id is distinct from public.app_workspace_id()
    or not public.can_actor_access_shipping_order(new.order_id) then
    raise exception 'the session actor cannot confirm shipping photos for this order'
      using errcode = '42501';
  end if;

  perform 1 from public.sales_order orders
  where orders.workspace_id = new.workspace_id and orders.id = new.order_id
    and orders.state in ('confirmed', 'picking', 'packed')
  for update;
  if not found then
    raise exception 'shipping photo confirmation order is unavailable'
      using errcode = '23514';
  end if;

  select decision.* into latest_decision
  from public.order_shipping_photo_decision decision
  where decision.workspace_id = new.workspace_id and decision.order_id = new.order_id
    and not exists (
      select 1 from public.order_shipping_photo_decision successor
      where successor.workspace_id = decision.workspace_id
        and successor.supersedes_id = decision.id
    )
  order by decision.revision desc
  limit 1;
  if latest_decision.id is null or latest_decision.photo_required is distinct from true
    or not public.shipping_sale_basis_snapshot_is_current(
      new.workspace_id, new.order_id, latest_decision.sale_basis_id
    ) then
    raise exception 'only a latest photo-required decision may be photo-confirmed'
      using errcode = '23514';
  end if;

  select array_agg(asset_id order by asset_id), count(*)::integer,
         count(distinct asset_id)::integer
  into submitted_ids, submitted_count, submitted_distinct_count
  from unnest(new.asset_ids) asset_id;
  if submitted_count <> submitted_distinct_count then
    raise exception 'shipping photo confirmation asset IDs must not contain duplicates'
      using errcode = '23505';
  end if;

  select array_agg(asset.id order by asset.id),
         count(*) filter (where asset.role = 'product')::integer,
         count(*) filter (where asset.role = 'packed_package')::integer
  into current_ids, product_count, packed_count
  from public.shipping_photo_asset asset
  where asset.workspace_id = new.workspace_id and asset.order_id = new.order_id;
  if product_count < 1 or packed_count < 1 or submitted_ids is distinct from current_ids then
    raise exception 'shipping photo confirmation must include the exact complete current asset set with both required roles'
      using errcode = '23514';
  end if;

  new.decision_id := latest_decision.id;
  new.asset_ids := submitted_ids;
  new.confirmed_by := actor_id;
  new.confirmed_at := statement_timestamp();
  return new;
end $$;

create trigger shipping_photo_confirmation_guard
before insert on shipping_photo_confirmation
for each row execute function validate_shipping_photo_confirmation();

create or replace function shipping_photo_preflight_satisfied(
  target_workspace_id uuid,
  target_order_id uuid
) returns boolean
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  latest_decision public.order_shipping_photo_decision%rowtype;
  current_ids uuid[];
  product_count integer;
  packed_count integer;
begin
  select decision.* into latest_decision
  from public.order_shipping_photo_decision decision
  where decision.workspace_id = target_workspace_id and decision.order_id = target_order_id
    and not exists (
      select 1 from public.order_shipping_photo_decision successor
      where successor.workspace_id = decision.workspace_id
        and successor.supersedes_id = decision.id
    )
  order by decision.revision desc
  limit 1;
  if latest_decision.id is null or latest_decision.photo_required is null
    or not public.shipping_sale_basis_snapshot_is_current(
      target_workspace_id, target_order_id, latest_decision.sale_basis_id
    ) then
    return false;
  end if;
  if not latest_decision.photo_required then
    return latest_decision.decision_state = 'satisfied_without_photo';
  end if;

  select array_agg(asset.id order by asset.id),
         count(*) filter (where asset.role = 'product')::integer,
         count(*) filter (where asset.role = 'packed_package')::integer
  into current_ids, product_count, packed_count
  from public.shipping_photo_asset asset
  where asset.workspace_id = target_workspace_id and asset.order_id = target_order_id;
  if product_count < 1 or packed_count < 1 then
    return false;
  end if;
  return exists (
    select 1 from public.shipping_photo_confirmation confirmation
    where confirmation.workspace_id = target_workspace_id
      and confirmation.order_id = target_order_id
      and confirmation.decision_id = latest_decision.id
      and confirmation.asset_ids = current_ids
  );
end $$;

create or replace function validate_packing_human_confirmation() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := public.app_identity_id();
  order_state text;
  has_legacy boolean;
  has_server_confirmation boolean;
begin
  if actor_id is null or new.workspace_id is distinct from public.app_workspace_id()
    or not public.can_actor_access_shipping_order(new.order_id) then
    raise exception 'the session actor cannot confirm packing for this order'
      using errcode = '42501';
  end if;
  select orders.state into order_state
  from public.sales_order orders
  where orders.workspace_id = new.workspace_id and orders.id = new.order_id
  for update;
  if not found then
    raise exception 'packing confirmation order is unavailable'
      using errcode = '23514';
  end if;
  select exists (
           select 1 from public.packing_evidence evidence
           where evidence.workspace_id = new.workspace_id and evidence.order_id = new.order_id
             and not evidence.server_confirmed
         ),
         exists (
           select 1 from public.packing_evidence evidence
           where evidence.workspace_id = new.workspace_id and evidence.order_id = new.order_id
             and evidence.server_confirmed
         )
  into has_legacy, has_server_confirmation;
  if has_server_confirmation
    or not (
      order_state = 'picking'
      or (order_state = 'packed' and has_legacy)
    )
    or not public.shipping_photo_preflight_satisfied(new.workspace_id, new.order_id) then
    raise exception 'packing requires a satisfied shipping photo preflight'
      using errcode = '23514';
  end if;
  new.id := gen_random_uuid();
  new.evidence_reference_id := new.id;
  new.confirmed_by := actor_id;
  new.confirmed_at := statement_timestamp();
  new.created_at := new.confirmed_at;
  new.server_confirmed := true;
  return new;
end $$;

create trigger packing_human_confirmation_guard
before insert on packing_evidence
for each row execute function validate_packing_human_confirmation();

create or replace function validate_shipment_human_confirmation() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare actor_id uuid := public.app_identity_id();
begin
  if actor_id is null or new.workspace_id is distinct from public.app_workspace_id()
    or not public.can_actor_access_shipping_order(new.order_id) then
    raise exception 'the session actor cannot confirm shipment for this order'
      using errcode = '42501';
  end if;
  perform 1 from public.sales_order orders
  where orders.workspace_id = new.workspace_id and orders.id = new.order_id
    and orders.state = 'packed'
  for update;
  if not found or not public.shipping_photo_preflight_satisfied(new.workspace_id, new.order_id)
    or not exists (
      select 1 from public.packing_evidence evidence
      where evidence.workspace_id = new.workspace_id and evidence.order_id = new.order_id
        and evidence.server_confirmed
    ) then
    raise exception 'shipment requires packed state, photo preflight and human packing confirmation'
      using errcode = '23514';
  end if;
  new.confirmed_by := actor_id;
  new.confirmed_at := statement_timestamp();
  return new;
end $$;

create trigger shipment_human_confirmation_guard
before insert on shipment_human_confirmation
for each row execute function validate_shipment_human_confirmation();

create or replace function reject_shipping_preflight_history_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'shipping preflight history is append-only; create a successor or new confirmation';
end $$;

create trigger shipping_photo_policy_append_only
before update or delete on shipping_photo_policy_revision
for each row execute function reject_shipping_preflight_history_mutation();
create trigger shipping_sale_basis_snapshot_append_only
before update or delete on shipping_sale_basis_snapshot
for each row execute function reject_shipping_preflight_history_mutation();
create trigger order_shipping_photo_decision_append_only
before update or delete on order_shipping_photo_decision
for each row execute function reject_shipping_preflight_history_mutation();
create trigger shipping_photo_asset_append_only
before update or delete on shipping_photo_asset
for each row execute function reject_shipping_preflight_history_mutation();
create trigger shipping_photo_confirmation_append_only
before update or delete on shipping_photo_confirmation
for each row execute function reject_shipping_preflight_history_mutation();
create trigger shipment_human_confirmation_append_only
before update or delete on shipment_human_confirmation
for each row execute function reject_shipping_preflight_history_mutation();
create trigger packing_human_confirmation_append_only
before update or delete on packing_evidence
for each row execute function reject_shipping_preflight_history_mutation();

create or replace function enforce_sales_order_transition() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  unit_id uuid;
  unit_status public.inventory_status;
  actor_id uuid := public.app_identity_id();
begin
  if old.state = new.state then return new; end if;
  if not (
    (old.state = 'draft' and new.state in ('confirmed', 'cancelled'))
    or (old.state = 'confirmed' and new.state in ('picking', 'cancelled'))
    or (old.state = 'picking' and new.state in ('packed', 'cancelled'))
    or (old.state = 'packed' and new.state in ('shipped', 'cancelled'))
    or (old.state = 'shipped' and new.state = 'returned')
  ) then
    raise exception 'sales order transition is not allowed';
  end if;

  select allocation.inventory_unit_id, unit.status
  into unit_id, unit_status
  from public.order_allocation allocation
  join public.inventory_unit unit
    on unit.workspace_id = allocation.workspace_id and unit.id = allocation.inventory_unit_id
  where allocation.workspace_id = new.workspace_id and allocation.order_id = new.id
    and allocation.active
  for update of unit;

  if new.state in ('picking', 'packed', 'shipped', 'returned') and unit_id is null then
    raise exception 'sales order requires an active allocation';
  end if;
  if new.state = 'picking' and unit_status <> 'picked' then
    raise exception 'picking state requires a confirmed pick scan';
  elsif new.state = 'packed' then
    if actor_id is null or not public.can_actor_access_shipping_order(new.id)
      or unit_status <> 'picked'
      or not public.shipping_photo_preflight_satisfied(new.workspace_id, new.id)
      or not exists (
        select 1 from public.packing_evidence evidence
        where evidence.workspace_id = new.workspace_id and evidence.order_id = new.id
          and evidence.server_confirmed and evidence.confirmed_by = actor_id
      ) then
      raise exception 'packed state requires assigned human packing confirmation and satisfied photo preflight'
        using errcode = '23514';
    end if;
    update public.inventory_unit set status = 'packed'
    where workspace_id = new.workspace_id and id = unit_id;
  elsif new.state = 'shipped' then
    if actor_id is null or not public.can_actor_access_shipping_order(new.id)
      or unit_status <> 'packed'
      or not public.shipping_photo_preflight_satisfied(new.workspace_id, new.id)
      or not exists (
        select 1 from public.shipment_human_confirmation confirmation
        where confirmation.workspace_id = new.workspace_id
          and confirmation.order_id = new.id
          and confirmation.confirmed_by = actor_id
      ) then
      raise exception 'shipped state requires assigned human shipment confirmation and satisfied photo preflight'
        using errcode = '23514';
    end if;
    update public.inventory_unit set status = 'shipped', location_id = null
    where workspace_id = new.workspace_id and id = unit_id;
  elsif new.state = 'returned' and unit_status <> 'shipped' then
    raise exception 'returned order requires shipped inventory';
  end if;
  return new;
end $$;

drop policy workspace_isolation on packing_evidence;
create policy shipping_order_access on packing_evidence
using (
  workspace_id = app_workspace_id()
  and can_actor_access_shipping_order(order_id)
)
with check (
  workspace_id = app_workspace_id()
  and can_actor_access_shipping_order(order_id)
);

alter table shipping_photo_policy_revision enable row level security;
alter table shipping_photo_policy_revision force row level security;
create policy shipping_photo_policy_owner on shipping_photo_policy_revision
using (
  workspace_id = app_workspace_id()
  and exists (
    select 1 from workspace_membership membership
    where membership.workspace_id = shipping_photo_policy_revision.workspace_id
      and membership.identity_id = app_identity_id()
      and membership.active and membership.role = 'owner'
  )
)
with check (
  workspace_id = app_workspace_id()
  and exists (
    select 1 from workspace_membership membership
    where membership.workspace_id = shipping_photo_policy_revision.workspace_id
      and membership.identity_id = app_identity_id()
      and membership.active and membership.role = 'owner'
  )
);

alter table shipping_sale_basis_snapshot enable row level security;
alter table shipping_sale_basis_snapshot force row level security;
create policy shipping_sale_basis_owner_accounting on shipping_sale_basis_snapshot
using (
  workspace_id = app_workspace_id()
  and exists (
    select 1 from workspace_membership membership
    where membership.workspace_id = shipping_sale_basis_snapshot.workspace_id
      and membership.identity_id = app_identity_id()
      and membership.active and membership.role in ('owner', 'accounting')
  )
)
with check (
  workspace_id = app_workspace_id()
  and can_actor_access_shipping_order(order_id)
);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'order_shipping_photo_decision', 'shipping_photo_asset',
    'shipping_photo_confirmation', 'shipment_human_confirmation'
  ] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('alter table %I force row level security', table_name);
    execute format(
      'create policy shipping_order_access on %I using (workspace_id = app_workspace_id() and can_actor_access_shipping_order(order_id)) with check (workspace_id = app_workspace_id() and can_actor_access_shipping_order(order_id))',
      table_name
    );
  end loop;
end $$;

grant select, insert on shipping_photo_policy_revision, order_shipping_photo_decision,
  shipping_photo_asset, shipping_photo_confirmation, shipment_human_confirmation
  to resale_app_runtime;

grant select on shipping_sale_basis_snapshot to resale_app_runtime;

revoke update, delete on shipping_photo_policy_revision, order_shipping_photo_decision,
  shipping_photo_asset, shipping_photo_confirmation, shipment_human_confirmation,
  packing_evidence from resale_app_runtime;

revoke insert, update, delete on shipping_sale_basis_snapshot from resale_app_runtime;

revoke all on function collect_shipping_sale_basis(uuid, uuid) from public;
revoke all on function shipping_sale_basis_snapshot_is_current(uuid, uuid, uuid) from public;
revoke all on function current_actor_shipping_sale_basis_is_current(uuid, uuid) from public;
grant execute on function current_actor_shipping_sale_basis_is_current(uuid, uuid)
  to resale_app_runtime;
revoke all on function lock_shipping_sale_basis_on_financial_event() from public;
revoke all on function validate_shipping_photo_policy_revision() from public;
revoke all on function validate_order_shipping_photo_decision() from public;
revoke all on function validate_shipping_photo_asset() from public;
revoke all on function validate_shipping_photo_confirmation() from public;
revoke all on function shipping_photo_preflight_satisfied(uuid, uuid) from public;
revoke all on function validate_packing_human_confirmation() from public;
revoke all on function validate_shipment_human_confirmation() from public;
revoke all on function reject_shipping_preflight_history_mutation() from public;

commit;
