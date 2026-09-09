begin;

create table order_number_counter (
  workspace_id uuid not null references workspace(id),
  business_date date not null,
  last_value bigint not null check (last_value > 0),
  primary key (workspace_id, business_date)
);

create or replace function issue_app_order_number() returns text
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare
  current_workspace_id uuid := public.app_workspace_id();
  current_identity_id uuid := public.app_identity_id();
  current_business_date date := (statement_timestamp() at time zone 'Asia/Tokyo')::date;
  issued_value bigint;
  issued_suffix text;
  candidate text;
begin
  if current_workspace_id is null or current_identity_id is null or not exists (
    select 1 from public.workspace_membership membership
    where membership.workspace_id = current_workspace_id
      and membership.identity_id = current_identity_id
      and membership.active
      and membership.role in ('owner', 'inventory_manager')
  ) then
    raise exception 'only active order managers may issue an application order number'
      using errcode = '42501';
  end if;

  loop
    insert into public.order_number_counter (workspace_id, business_date, last_value)
    values (current_workspace_id, current_business_date, 1)
    on conflict (workspace_id, business_date) do update
      set last_value = public.order_number_counter.last_value + 1
    returning last_value into issued_value;

    issued_suffix := issued_value::text;
    if length(issued_suffix) < 6 then
      issued_suffix := repeat('0', 6 - length(issued_suffix)) || issued_suffix;
    end if;
    candidate := 'ORD-' || to_char(current_business_date, 'YYYYMMDD') || '-' || issued_suffix;
    exit when not exists (
      select 1 from public.sales_order orders
      where orders.workspace_id = current_workspace_id
        and orders.order_number = candidate
    );
  end loop;
  return candidate;
end
$$;

create table order_registration_revision (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  order_id uuid not null,
  sales_channel_key text not null,
  sales_channel_name text not null,
  channel_transaction_id text,
  buyer_display_name text,
  revision integer not null check (revision between 1 and 10000),
  supersedes_id uuid,
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  changed_by uuid not null references app_identity(id),
  changed_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, id),
  unique (workspace_id, order_id, id),
  unique (workspace_id, order_id, revision),
  unique (workspace_id, order_id, idempotency_key),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id),
  foreign key (workspace_id, order_id, supersedes_id)
    references order_registration_revision(workspace_id, order_id, id)
    deferrable initially deferred,
  check (sales_channel_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  check (sales_channel_name = btrim(sales_channel_name) and char_length(sales_channel_name) between 1 and 80),
  check (channel_transaction_id is null or (
    channel_transaction_id = btrim(channel_transaction_id)
    and char_length(channel_transaction_id) between 1 and 160
  )),
  check (buyer_display_name is null or (
    buyer_display_name = btrim(buyer_display_name)
    and char_length(buyer_display_name) between 1 and 160
  ))
);

create unique index order_registration_one_successor
on order_registration_revision(workspace_id, order_id, supersedes_id)
where supersedes_id is not null;

create table order_channel_transaction_claim (
  workspace_id uuid not null references workspace(id),
  sales_channel_key text not null,
  channel_transaction_id text not null,
  order_id uuid not null,
  claimed_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, sales_channel_key, channel_transaction_id),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id),
  check (sales_channel_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  check (
    channel_transaction_id = btrim(channel_transaction_id)
    and char_length(channel_transaction_id) between 1 and 160
  )
);

create table shipping_method_catalog_revision (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  method_id uuid not null,
  sales_channel_key text not null,
  sales_channel_name text not null,
  method_name text not null,
  tracking_available boolean not null,
  fee_minor bigint not null check (fee_minor between 0 and 100000000),
  delivery_estimate text,
  official_checked_on date not null,
  official_reference_url text,
  official_reference_note text,
  active boolean not null,
  revision integer not null check (revision between 1 and 10000),
  supersedes_id uuid,
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  changed_by uuid not null references app_identity(id),
  changed_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, id),
  unique (workspace_id, method_id, id),
  unique (workspace_id, method_id, revision),
  unique (workspace_id, idempotency_key),
  foreign key (workspace_id, method_id, supersedes_id)
    references shipping_method_catalog_revision(workspace_id, method_id, id)
    deferrable initially deferred,
  check (sales_channel_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  check (sales_channel_name = btrim(sales_channel_name) and char_length(sales_channel_name) between 1 and 80),
  check (method_name = btrim(method_name) and char_length(method_name) between 1 and 120),
  check (delivery_estimate is null or (
    delivery_estimate = btrim(delivery_estimate)
    and char_length(delivery_estimate) between 1 and 80
  )),
  check (official_reference_url is null or (
    char_length(official_reference_url) between 1 and 2048
    and official_reference_url ~ '^https://[^[:space:]]+$'
  )),
  check (official_reference_note is null or (
    official_reference_note = btrim(official_reference_note)
    and char_length(official_reference_note) between 1 and 500
  )),
  check (official_reference_url is not null or official_reference_note is not null)
);

create unique index shipping_method_catalog_one_successor
on shipping_method_catalog_revision(workspace_id, method_id, supersedes_id)
where supersedes_id is not null;

create index shipping_method_catalog_current_channel
on shipping_method_catalog_revision(workspace_id, sales_channel_key, method_id, revision desc);

create table order_shipping_method_selection (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  order_id uuid not null,
  registration_revision_id uuid not null,
  method_id uuid not null,
  catalog_revision_id uuid not null,
  selected_fee_minor bigint not null check (selected_fee_minor between 0 and 100000000),
  revision integer not null check (revision between 1 and 10000),
  supersedes_id uuid,
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  selected_by uuid not null references app_identity(id),
  selected_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, id),
  unique (workspace_id, order_id, id),
  unique (workspace_id, order_id, revision),
  unique (workspace_id, order_id, idempotency_key),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id),
  foreign key (workspace_id, order_id, registration_revision_id)
    references order_registration_revision(workspace_id, order_id, id),
  foreign key (workspace_id, method_id, catalog_revision_id)
    references shipping_method_catalog_revision(workspace_id, method_id, id),
  foreign key (workspace_id, order_id, supersedes_id)
    references order_shipping_method_selection(workspace_id, order_id, id)
    deferrable initially deferred
);

create unique index order_shipping_method_one_successor
on order_shipping_method_selection(workspace_id, order_id, supersedes_id)
where supersedes_id is not null;

create table order_shipping_readiness_confirmation (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  order_id uuid not null,
  registration_revision_id uuid not null,
  shipping_method_selection_id uuid not null,
  missing_information text[] not null,
  sale_amount_state text not null check (sale_amount_state in ('present', 'missing')),
  sale_basis_sha256 text not null check (sale_basis_sha256 ~ '^[a-f0-9]{64}$'),
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  confirmed_by uuid not null references app_identity(id),
  confirmed_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, id),
  unique (workspace_id, order_id, id),
  unique (workspace_id, order_id, idempotency_key),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id),
  foreign key (workspace_id, order_id, registration_revision_id)
    references order_registration_revision(workspace_id, order_id, id),
  foreign key (workspace_id, order_id, shipping_method_selection_id)
    references order_shipping_method_selection(workspace_id, order_id, id),
  check (
    missing_information <@ array['channel_transaction_id', 'sale_amount']::text[]
    and cardinality(missing_information) <= 2
  )
);

alter table shipment_human_confirmation
  add column shipping_method_selection_id uuid,
  add column readiness_confirmation_id uuid,
  add column shipping_fee_minor bigint,
  add column shipped_at timestamptz,
  add column shipping_financial_event_id uuid;

alter table shipment_human_confirmation
  add foreign key (workspace_id, order_id, shipping_method_selection_id)
    references order_shipping_method_selection(workspace_id, order_id, id),
  add foreign key (workspace_id, order_id, readiness_confirmation_id)
    references order_shipping_readiness_confirmation(workspace_id, order_id, id),
  add foreign key (workspace_id, shipping_financial_event_id)
    references financial_event(workspace_id, id),
  add constraint shipment_p14_fields_all_or_none check (
    (shipping_method_selection_id is null and readiness_confirmation_id is null
      and shipping_fee_minor is null and shipped_at is null
      and shipping_financial_event_id is null)
    or
    (shipping_method_selection_id is not null and readiness_confirmation_id is not null
      and shipping_fee_minor between 0 and 100000000 and shipped_at is not null
      and shipping_financial_event_id is not null)
  );

create or replace function validate_order_registration_revision() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := public.app_identity_id();
  prior public.order_registration_revision%rowtype;
  replay public.order_registration_revision%rowtype;
  order_state text;
  claimed_order_id uuid;
begin
  if actor_id is null or new.workspace_id is distinct from public.app_workspace_id()
    or not exists (
      select 1 from public.workspace_membership membership
      where membership.workspace_id = new.workspace_id
        and membership.identity_id = actor_id
        and membership.active
        and membership.role in ('owner', 'inventory_manager')
    ) then
    raise exception 'only active order managers may change order registration'
      using errcode = '42501';
  end if;

  select orders.state into order_state
  from public.sales_order orders
  where orders.workspace_id = new.workspace_id and orders.id = new.order_id
  for update;
  if not found or order_state not in ('confirmed', 'picking', 'packed') then
    raise exception 'order registration is unavailable after shipment or cancellation'
      using errcode = '23514';
  end if;

  select registration.* into replay
  from public.order_registration_revision registration
  where registration.workspace_id = new.workspace_id
    and registration.order_id = new.order_id
    and registration.idempotency_key = new.idempotency_key;
  if replay.id is not null then
    if replay.payload_hash is distinct from new.payload_hash then
      raise exception 'order registration idempotency key has another payload'
        using errcode = '23505';
    end if;
    return null;
  end if;

  if new.revision = 1 and exists (
    select 1 from public.financial_event event
    where event.workspace_id = new.workspace_id
      and event.order_id = new.order_id
      and event.event_type = 'shipping'
  ) then
    raise exception 'an order with a pre-existing shipping fact cannot enter P14 registration'
      using errcode = '23514';
  end if;

  if new.revision = 1 then
    if new.supersedes_id is not null or exists (
      select 1 from public.order_registration_revision registration
      where registration.workspace_id = new.workspace_id
        and registration.order_id = new.order_id
    ) then
      raise exception 'the first order registration must start an empty chain'
        using errcode = '23514';
    end if;
  else
    select registration.* into prior
    from public.order_registration_revision registration
    where registration.workspace_id = new.workspace_id
      and registration.order_id = new.order_id
      and registration.id = new.supersedes_id
    for key share;
    if prior.id is null or prior.revision + 1 <> new.revision or exists (
      select 1 from public.order_registration_revision successor
      where successor.workspace_id = prior.workspace_id
        and successor.order_id = prior.order_id
        and successor.supersedes_id = prior.id
    ) then
      raise exception 'order registration must supersede the latest immediate revision'
        using errcode = '23514';
    end if;
  end if;

  if new.channel_transaction_id is not null then
    insert into public.order_channel_transaction_claim (
      workspace_id, sales_channel_key, channel_transaction_id, order_id
    ) values (
      new.workspace_id, new.sales_channel_key, new.channel_transaction_id, new.order_id
    ) on conflict (workspace_id, sales_channel_key, channel_transaction_id) do nothing;

    select claim.order_id into claimed_order_id
    from public.order_channel_transaction_claim claim
    where claim.workspace_id = new.workspace_id
      and claim.sales_channel_key = new.sales_channel_key
      and claim.channel_transaction_id = new.channel_transaction_id;
    if claimed_order_id is distinct from new.order_id then
      raise exception 'the sales channel transaction is already claimed by another order'
        using errcode = '23505';
    end if;
  end if;

  new.changed_by := actor_id;
  new.changed_at := statement_timestamp();
  return new;
end
$$;

create trigger order_registration_revision_guard
before insert on order_registration_revision
for each row execute function validate_order_registration_revision();

create or replace function guard_p14_shipping_financial_event() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  order_created_at timestamptz;
begin
  if new.event_type <> 'shipping' or new.order_id is null then
    return new;
  end if;

  select orders.created_at into order_created_at
  from public.sales_order orders
  where orders.workspace_id = new.workspace_id and orders.id = new.order_id
  for update;
  if not found then
    raise exception 'shipping financial event order is unavailable'
      using errcode = '23503';
  end if;

  if not exists (
    select 1 from public.order_registration_revision registration
    where registration.workspace_id = new.workspace_id
      and registration.order_id = new.order_id
  ) then
    return new;
  end if;

  if pg_trigger_depth() <> 2
    or new.sku_id is null
    or new.amount_minor < 0 or new.amount_minor > 100000000
    or new.currency <> 'JPY'
    or new.bearer <> 'seller'
    or new.source <> 'manual'
    or new.source_meaning <> '人が選択した配送方法の送料'
    or new.rounding_rule_version <> 'jpy-v1'
    or new.source_already_net
    or new.reverses_event_id is not null
    or order_created_at is null
    or new.occurred_at < order_created_at
    or new.occurred_at > clock_timestamp() + interval '5 minutes'
    or exists (
      select 1 from public.financial_event event
      where event.workspace_id = new.workspace_id
        and event.order_id = new.order_id
        and event.event_type = 'shipping'
    ) then
    raise exception 'registered shipping facts may only be created by shipment confirmation'
      using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger financial_event_p14_shipping_contract_guard
before insert on financial_event
for each row execute function guard_p14_shipping_financial_event();

create or replace function validate_shipping_method_catalog_revision() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := public.app_identity_id();
  prior public.shipping_method_catalog_revision%rowtype;
  replay public.shipping_method_catalog_revision%rowtype;
begin
  if actor_id is null or new.workspace_id is distinct from public.app_workspace_id()
    or not exists (
      select 1 from public.workspace_membership membership
      where membership.workspace_id = new.workspace_id
        and membership.identity_id = actor_id
        and membership.active
        and membership.role in ('owner', 'inventory_manager')
    ) then
    raise exception 'only active order managers may change the shipping method catalog'
      using errcode = '42501';
  end if;
  perform public.lock_current_shipping_workspace();
  if new.official_checked_on > (statement_timestamp() at time zone 'Asia/Tokyo')::date then
    raise exception 'official shipping information cannot be confirmed in the future'
      using errcode = '23514';
  end if;

  select method.* into replay
  from public.shipping_method_catalog_revision method
  where method.workspace_id = new.workspace_id
    and method.idempotency_key = new.idempotency_key;
  if replay.id is not null then
    if replay.payload_hash is distinct from new.payload_hash then
      raise exception 'shipping method idempotency key has another payload'
        using errcode = '23505';
    end if;
    return null;
  end if;

  if new.revision = 1 then
    if new.supersedes_id is not null or exists (
      select 1 from public.shipping_method_catalog_revision method
      where method.workspace_id = new.workspace_id and method.method_id = new.method_id
    ) then
      raise exception 'the first shipping method revision must start an empty chain'
        using errcode = '23514';
    end if;
  else
    select method.* into prior
    from public.shipping_method_catalog_revision method
    where method.workspace_id = new.workspace_id
      and method.method_id = new.method_id
      and method.id = new.supersedes_id
    for key share;
    if prior.id is null or prior.revision + 1 <> new.revision
      or prior.sales_channel_key <> new.sales_channel_key
      or exists (
        select 1 from public.shipping_method_catalog_revision successor
        where successor.workspace_id = prior.workspace_id
          and successor.method_id = prior.method_id
          and successor.supersedes_id = prior.id
      ) then
      raise exception 'shipping method must supersede the latest revision in the same channel'
        using errcode = '23514';
    end if;
  end if;

  new.changed_by := actor_id;
  new.changed_at := statement_timestamp();
  return new;
end
$$;

create trigger shipping_method_catalog_revision_guard
before insert on shipping_method_catalog_revision
for each row execute function validate_shipping_method_catalog_revision();

create or replace function validate_order_shipping_method_selection() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := public.app_identity_id();
  order_state text;
  registration public.order_registration_revision%rowtype;
  catalog public.shipping_method_catalog_revision%rowtype;
  prior public.order_shipping_method_selection%rowtype;
  replay public.order_shipping_method_selection%rowtype;
begin
  if actor_id is null or new.workspace_id is distinct from public.app_workspace_id()
    or not public.can_actor_access_shipping_order(new.order_id) then
    raise exception 'the session actor cannot select a shipping method for this order'
      using errcode = '42501';
  end if;
  select orders.state into order_state
  from public.sales_order orders
  where orders.workspace_id = new.workspace_id and orders.id = new.order_id
  for update;
  if not found or order_state not in ('confirmed', 'picking', 'packed') then
    raise exception 'shipping method selection is unavailable for this order'
      using errcode = '23514';
  end if;

  select selection.* into replay
  from public.order_shipping_method_selection selection
  where selection.workspace_id = new.workspace_id
    and selection.order_id = new.order_id
    and selection.idempotency_key = new.idempotency_key;
  if replay.id is not null then
    if replay.payload_hash is distinct from new.payload_hash then
      raise exception 'shipping method selection idempotency key has another payload'
        using errcode = '23505';
    end if;
    return null;
  end if;

  select candidate.* into registration
  from public.order_registration_revision candidate
  where candidate.workspace_id = new.workspace_id and candidate.order_id = new.order_id
    and not exists (
      select 1 from public.order_registration_revision successor
      where successor.workspace_id = candidate.workspace_id
        and successor.order_id = candidate.order_id
        and successor.supersedes_id = candidate.id
    )
  order by candidate.revision desc limit 1;
  if registration.id is null then
    raise exception 'shipping method selection requires registered sales channel information'
      using errcode = '23514';
  end if;

  select candidate.* into catalog
  from public.shipping_method_catalog_revision candidate
  where candidate.workspace_id = new.workspace_id and candidate.method_id = new.method_id
    and not exists (
      select 1 from public.shipping_method_catalog_revision successor
      where successor.workspace_id = candidate.workspace_id
        and successor.method_id = candidate.method_id
        and successor.supersedes_id = candidate.id
    )
  order by candidate.revision desc limit 1;
  if catalog.id is null or not catalog.active
    or catalog.sales_channel_key <> registration.sales_channel_key then
    raise exception 'the selected shipping method is inactive or belongs to another sales channel'
      using errcode = '23514';
  end if;

  if new.revision = 1 then
    if new.supersedes_id is not null or exists (
      select 1 from public.order_shipping_method_selection selection
      where selection.workspace_id = new.workspace_id and selection.order_id = new.order_id
    ) then
      raise exception 'the first shipping method selection must start an empty chain'
        using errcode = '23514';
    end if;
  else
    select selection.* into prior
    from public.order_shipping_method_selection selection
    where selection.workspace_id = new.workspace_id
      and selection.order_id = new.order_id
      and selection.id = new.supersedes_id
    for key share;
    if prior.id is null or prior.revision + 1 <> new.revision or exists (
      select 1 from public.order_shipping_method_selection successor
      where successor.workspace_id = prior.workspace_id
        and successor.order_id = prior.order_id
        and successor.supersedes_id = prior.id
    ) then
      raise exception 'shipping method selection must supersede the latest immediate revision'
        using errcode = '23514';
    end if;
  end if;

  new.registration_revision_id := registration.id;
  new.catalog_revision_id := catalog.id;
  new.selected_fee_minor := catalog.fee_minor;
  new.selected_by := actor_id;
  new.selected_at := statement_timestamp();
  return new;
end
$$;

create trigger order_shipping_method_selection_guard
before insert on order_shipping_method_selection
for each row execute function validate_order_shipping_method_selection();

create or replace function record_order_shipping_method_selection(
  target_order_id uuid,
  target_method_id uuid,
  target_expected_revision integer,
  target_idempotency_key uuid,
  target_payload_hash text
) returns uuid
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := public.app_identity_id();
  target_workspace_id uuid := public.app_workspace_id();
  order_state text;
  registration public.order_registration_revision%rowtype;
  catalog public.shipping_method_catalog_revision%rowtype;
  current_selection public.order_shipping_method_selection%rowtype;
  replay public.order_shipping_method_selection%rowtype;
  inserted_id uuid;
begin
  if actor_id is null or target_workspace_id is null
    or not public.can_actor_access_shipping_order(target_order_id) then
    raise exception 'the session actor cannot select a shipping method for this order'
      using errcode = '42501';
  end if;
  if target_method_id is null or target_idempotency_key is null
    or target_payload_hash is null or target_payload_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'shipping method selection input is invalid'
      using errcode = '23514';
  end if;

  select orders.state into order_state
  from public.sales_order orders
  where orders.workspace_id = target_workspace_id and orders.id = target_order_id
  for update;
  if not found or order_state not in ('confirmed', 'picking', 'packed') then
    raise exception 'shipping method selection is unavailable for this order'
      using errcode = '23514';
  end if;

  select selection.* into replay
  from public.order_shipping_method_selection selection
  where selection.workspace_id = target_workspace_id
    and selection.order_id = target_order_id
    and selection.idempotency_key = target_idempotency_key;
  if replay.id is not null then
    if replay.payload_hash is distinct from target_payload_hash then
      raise exception 'shipping method selection idempotency key has another payload'
        using errcode = '23505';
    end if;
    return replay.id;
  end if;

  select candidate.* into current_selection
  from public.order_shipping_method_selection candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.order_id = target_order_id
    and not exists (
      select 1 from public.order_shipping_method_selection successor
      where successor.workspace_id = candidate.workspace_id
        and successor.order_id = candidate.order_id
        and successor.supersedes_id = candidate.id
    )
  order by candidate.revision desc limit 1;
  if (current_selection.id is null and target_expected_revision is not null)
    or (current_selection.id is not null
      and current_selection.revision is distinct from target_expected_revision) then
    raise exception 'the shipping method selection revision is stale'
      using errcode = '23505';
  end if;

  select candidate.* into registration
  from public.order_registration_revision candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.order_id = target_order_id
    and not exists (
      select 1 from public.order_registration_revision successor
      where successor.workspace_id = candidate.workspace_id
        and successor.order_id = candidate.order_id
        and successor.supersedes_id = candidate.id
    )
  order by candidate.revision desc limit 1;
  select candidate.* into catalog
  from public.shipping_method_catalog_revision candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.method_id = target_method_id
    and not exists (
      select 1 from public.shipping_method_catalog_revision successor
      where successor.workspace_id = candidate.workspace_id
        and successor.method_id = candidate.method_id
        and successor.supersedes_id = candidate.id
    )
  order by candidate.revision desc limit 1;
  if registration.id is null or catalog.id is null or not catalog.active
    or catalog.sales_channel_key <> registration.sales_channel_key then
    raise exception 'the selected shipping method is unavailable for the current sales channel'
      using errcode = '23514';
  end if;

  insert into public.order_shipping_method_selection (
    workspace_id, order_id, registration_revision_id, method_id,
    catalog_revision_id, selected_fee_minor, revision, supersedes_id,
    idempotency_key, payload_hash, selected_by
  ) values (
    target_workspace_id, target_order_id, registration.id, catalog.method_id,
    catalog.id, catalog.fee_minor, coalesce(current_selection.revision, 0) + 1,
    current_selection.id, target_idempotency_key, target_payload_hash, actor_id
  ) returning id into inserted_id;
  return inserted_id;
end
$$;

create or replace function validate_order_shipping_readiness_confirmation() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := public.app_identity_id();
  order_state text;
  registration public.order_registration_revision%rowtype;
  selection public.order_shipping_method_selection%rowtype;
  replay public.order_shipping_readiness_confirmation%rowtype;
  sale_basis record;
  expected_missing text[];
begin
  if actor_id is null or new.workspace_id is distinct from public.app_workspace_id()
    or not public.can_actor_access_shipping_order(new.order_id) then
    raise exception 'the session actor cannot confirm shipping readiness for this order'
      using errcode = '42501';
  end if;
  select orders.state into order_state
  from public.sales_order orders
  where orders.workspace_id = new.workspace_id and orders.id = new.order_id
  for update;
  if not found or order_state <> 'packed' then
    raise exception 'shipping readiness can only be confirmed after human packing'
      using errcode = '23514';
  end if;

  select confirmation.* into replay
  from public.order_shipping_readiness_confirmation confirmation
  where confirmation.workspace_id = new.workspace_id
    and confirmation.order_id = new.order_id
    and confirmation.idempotency_key = new.idempotency_key;
  if replay.id is not null then
    if replay.payload_hash is distinct from new.payload_hash then
      raise exception 'shipping readiness idempotency key has another payload'
        using errcode = '23505';
    end if;
    return null;
  end if;

  select candidate.* into registration
  from public.order_registration_revision candidate
  where candidate.workspace_id = new.workspace_id and candidate.order_id = new.order_id
    and not exists (
      select 1 from public.order_registration_revision successor
      where successor.workspace_id = candidate.workspace_id
        and successor.order_id = candidate.order_id
        and successor.supersedes_id = candidate.id
    )
  order by candidate.revision desc limit 1;
  select candidate.* into selection
  from public.order_shipping_method_selection candidate
  where candidate.workspace_id = new.workspace_id and candidate.order_id = new.order_id
    and not exists (
      select 1 from public.order_shipping_method_selection successor
      where successor.workspace_id = candidate.workspace_id
        and successor.order_id = candidate.order_id
        and successor.supersedes_id = candidate.id
    )
  order by candidate.revision desc limit 1;
  if registration.id is null or selection.id is null
    or selection.registration_revision_id <> registration.id then
    raise exception 'shipping readiness requires current order details and shipping method'
      using errcode = '23514';
  end if;

  select * into sale_basis
  from public.collect_shipping_sale_basis(new.workspace_id, new.order_id);
  expected_missing := array[]::text[];
  if registration.channel_transaction_id is null then
    expected_missing := array_append(expected_missing, 'channel_transaction_id');
  end if;
  if sale_basis.active_sale_count = 0 then
    expected_missing := array_append(expected_missing, 'sale_amount');
  end if;
  if cardinality(new.missing_information) <> cardinality(expected_missing)
    or not new.missing_information @> expected_missing
    or not new.missing_information <@ expected_missing then
    raise exception 'human acknowledgement must exactly match the current missing information'
      using errcode = '23514';
  end if;

  new.missing_information := expected_missing;
  new.registration_revision_id := registration.id;
  new.shipping_method_selection_id := selection.id;
  new.sale_amount_state := case
    when sale_basis.active_sale_count = 0 then 'missing' else 'present'
  end;
  new.sale_basis_sha256 := sale_basis.source_set_sha256;
  new.confirmed_by := actor_id;
  new.confirmed_at := statement_timestamp();
  return new;
end
$$;

create trigger order_shipping_readiness_confirmation_guard
before insert on order_shipping_readiness_confirmation
for each row execute function validate_order_shipping_readiness_confirmation();

create or replace function record_order_shipping_readiness_confirmation(
  target_order_id uuid,
  target_expected_registration_revision integer,
  target_expected_selection_revision integer,
  target_acknowledged_missing_information text[],
  target_idempotency_key uuid,
  target_payload_hash text
) returns table (
  confirmation_id uuid,
  confirmation_at timestamptz,
  confirmation_current boolean
)
language plpgsql volatile security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := public.app_identity_id();
  target_workspace_id uuid := public.app_workspace_id();
  order_state text;
  replay public.order_shipping_readiness_confirmation%rowtype;
  registration public.order_registration_revision%rowtype;
  selection public.order_shipping_method_selection%rowtype;
  sale_basis record;
  expected_missing text[] := array[]::text[];
  recorded_id uuid;
  recorded_at timestamptz;
begin
  if actor_id is null or target_workspace_id is null
    or not public.can_actor_access_shipping_order(target_order_id) then
    raise exception 'the session actor cannot confirm shipping readiness for this order'
      using errcode = '42501';
  end if;
  if target_expected_registration_revision is null
    or target_expected_selection_revision is null
    or target_acknowledged_missing_information is null
    or target_idempotency_key is null
    or target_payload_hash is null
    or target_payload_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'shipping readiness confirmation input is invalid'
      using errcode = '23514';
  end if;

  select orders.state into order_state
  from public.sales_order orders
  where orders.workspace_id = target_workspace_id and orders.id = target_order_id
  for update;
  if not found then
    raise exception 'shipping readiness order is unavailable' using errcode = '42501';
  end if;

  select confirmation.* into replay
  from public.order_shipping_readiness_confirmation confirmation
  where confirmation.workspace_id = target_workspace_id
    and confirmation.order_id = target_order_id
    and confirmation.idempotency_key = target_idempotency_key;
  if replay.id is not null then
    if replay.payload_hash is distinct from target_payload_hash then
      raise exception 'shipping readiness idempotency key has another payload'
        using errcode = '23505';
    end if;
    return query select replay.id, replay.confirmed_at,
      public.order_shipping_readiness_confirmation_is_current(
        target_workspace_id, target_order_id, replay.id
      );
    return;
  end if;

  if order_state <> 'packed' then
    raise exception 'shipping readiness can only be confirmed after human packing'
      using errcode = '23514';
  end if;

  select candidate.* into registration
  from public.order_registration_revision candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.order_id = target_order_id
    and not exists (
      select 1 from public.order_registration_revision successor
      where successor.workspace_id = candidate.workspace_id
        and successor.order_id = candidate.order_id
        and successor.supersedes_id = candidate.id
    )
  order by candidate.revision desc limit 1;
  select candidate.* into selection
  from public.order_shipping_method_selection candidate
  where candidate.workspace_id = target_workspace_id
    and candidate.order_id = target_order_id
    and not exists (
      select 1 from public.order_shipping_method_selection successor
      where successor.workspace_id = candidate.workspace_id
        and successor.order_id = candidate.order_id
        and successor.supersedes_id = candidate.id
    )
  order by candidate.revision desc limit 1;
  if registration.id is null or selection.id is null
    or selection.registration_revision_id <> registration.id
    or registration.revision <> target_expected_registration_revision
    or selection.revision <> target_expected_selection_revision then
    raise exception 'shipping readiness information is stale' using errcode = '23505';
  end if;

  select * into sale_basis
  from public.collect_shipping_sale_basis(target_workspace_id, target_order_id);
  if registration.channel_transaction_id is null then
    expected_missing := array_append(expected_missing, 'channel_transaction_id');
  end if;
  if sale_basis.active_sale_count = 0 then
    expected_missing := array_append(expected_missing, 'sale_amount');
  end if;
  if cardinality(target_acknowledged_missing_information) <> cardinality(expected_missing)
    or not target_acknowledged_missing_information @> expected_missing
    or not target_acknowledged_missing_information <@ expected_missing then
    raise exception 'human acknowledgement must exactly match the current missing information'
      using errcode = '23514';
  end if;

  insert into public.order_shipping_readiness_confirmation (
    workspace_id, order_id, registration_revision_id,
    shipping_method_selection_id, missing_information, sale_amount_state,
    sale_basis_sha256, idempotency_key, payload_hash, confirmed_by
  ) values (
    target_workspace_id, target_order_id, registration.id, selection.id,
    expected_missing,
    case when sale_basis.active_sale_count = 0 then 'missing' else 'present' end,
    sale_basis.source_set_sha256, target_idempotency_key, target_payload_hash, actor_id
  ) returning id, confirmed_at into recorded_id, recorded_at;
  return query select recorded_id, recorded_at, true;
end
$$;

create or replace function order_shipping_readiness_confirmation_is_current(
  target_workspace_id uuid,
  target_order_id uuid,
  target_confirmation_id uuid
) returns boolean
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  confirmation public.order_shipping_readiness_confirmation%rowtype;
  registration public.order_registration_revision%rowtype;
  selection public.order_shipping_method_selection%rowtype;
  sale_basis record;
  expected_missing text[];
begin
  select row_value.* into confirmation
  from public.order_shipping_readiness_confirmation row_value
  where row_value.workspace_id = target_workspace_id
    and row_value.order_id = target_order_id
    and row_value.id = target_confirmation_id;
  if confirmation.id is null then return false; end if;

  select candidate.* into registration
  from public.order_registration_revision candidate
  where candidate.workspace_id = target_workspace_id and candidate.order_id = target_order_id
    and not exists (
      select 1 from public.order_registration_revision successor
      where successor.workspace_id = candidate.workspace_id
        and successor.order_id = candidate.order_id
        and successor.supersedes_id = candidate.id
    )
  order by candidate.revision desc limit 1;
  select candidate.* into selection
  from public.order_shipping_method_selection candidate
  where candidate.workspace_id = target_workspace_id and candidate.order_id = target_order_id
    and not exists (
      select 1 from public.order_shipping_method_selection successor
      where successor.workspace_id = candidate.workspace_id
        and successor.order_id = candidate.order_id
        and successor.supersedes_id = candidate.id
    )
  order by candidate.revision desc limit 1;
  if registration.id is null or selection.id is null
    or confirmation.registration_revision_id <> registration.id
    or confirmation.shipping_method_selection_id <> selection.id then
    return false;
  end if;

  select * into sale_basis
  from public.collect_shipping_sale_basis(target_workspace_id, target_order_id);
  expected_missing := array[]::text[];
  if registration.channel_transaction_id is null then
    expected_missing := array_append(expected_missing, 'channel_transaction_id');
  end if;
  if sale_basis.active_sale_count = 0 then
    expected_missing := array_append(expected_missing, 'sale_amount');
  end if;
  return confirmation.missing_information = expected_missing
    and confirmation.sale_basis_sha256 = sale_basis.source_set_sha256
    and confirmation.sale_amount_state = case
      when sale_basis.active_sale_count = 0 then 'missing' else 'present'
    end;
end
$$;

create or replace function current_actor_shipping_method_options(target_order_id uuid)
returns table (
  method_id uuid,
  catalog_revision_id uuid,
  sales_channel_key text,
  sales_channel_name text,
  method_name text,
  tracking_available boolean,
  fee_minor bigint,
  delivery_estimate text,
  official_checked_on date
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  with current_registration as (
    select registration.*
    from public.order_registration_revision registration
    where registration.workspace_id = public.app_workspace_id()
      and registration.order_id = target_order_id
      and not exists (
        select 1 from public.order_registration_revision successor
        where successor.workspace_id = registration.workspace_id
          and successor.order_id = registration.order_id
          and successor.supersedes_id = registration.id
      )
    order by registration.revision desc limit 1
  )
  select method.method_id, method.id, method.sales_channel_key,
         method.sales_channel_name, method.method_name, method.tracking_available,
         method.fee_minor, method.delivery_estimate, method.official_checked_on
  from public.shipping_method_catalog_revision method
  join current_registration registration
    on registration.sales_channel_key = method.sales_channel_key
  where public.can_actor_access_shipping_order(target_order_id)
    and method.workspace_id = public.app_workspace_id()
    and method.active
    and not exists (
      select 1 from public.shipping_method_catalog_revision successor
      where successor.workspace_id = method.workspace_id
        and successor.method_id = method.method_id
        and successor.supersedes_id = method.id
    )
  order by method.fee_minor, method.method_name, method.method_id
$$;

create or replace function current_actor_shipping_method_selection_by_idempotency(
  target_order_id uuid,
  target_idempotency_key uuid
) returns table (
  selection_id uuid,
  order_id uuid,
  selection_revision integer,
  selection_supersedes_id uuid,
  payload_hash text,
  selected_at timestamptz,
  method_id uuid,
  catalog_revision_id uuid,
  sales_channel_key text,
  sales_channel_name text,
  method_name text,
  tracking_available boolean,
  fee_minor bigint,
  delivery_estimate text,
  official_checked_on date
)
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select selection.id, selection.order_id, selection.revision,
         selection.supersedes_id, selection.payload_hash, selection.selected_at,
         method.method_id, method.id, method.sales_channel_key, method.sales_channel_name,
         method.method_name, method.tracking_available, selection.selected_fee_minor,
         method.delivery_estimate, method.official_checked_on
  from public.order_shipping_method_selection selection
  join public.shipping_method_catalog_revision method
    on method.workspace_id = selection.workspace_id
   and method.method_id = selection.method_id
   and method.id = selection.catalog_revision_id
  where public.can_actor_access_shipping_order(target_order_id)
    and selection.workspace_id = public.app_workspace_id()
    and selection.order_id = target_order_id
    and selection.idempotency_key = target_idempotency_key
$$;

create or replace function current_actor_order_shipping_context(target_order_id uuid)
returns table (
  order_id uuid,
  order_number text,
  registration_revision_id uuid,
  registration_revision integer,
  sales_channel_key text,
  sales_channel_name text,
  channel_transaction_id_status text,
  sale_amount_status text,
  selection_id uuid,
  selection_revision integer,
  selection_supersedes_id uuid,
  method_id uuid,
  catalog_revision_id uuid,
  method_name text,
  tracking_available boolean,
  selected_fee_minor bigint,
  delivery_estimate text,
  official_checked_on date,
  selected_at timestamptz,
  missing_information text[],
  blocking_issues text[],
  confirmation_state text,
  confirmation_id uuid,
  confirmation_at timestamptz
)
language plpgsql stable security definer
set search_path = pg_catalog, public
as $$
declare
  context_order public.sales_order%rowtype;
  registration public.order_registration_revision%rowtype;
  selection public.order_shipping_method_selection%rowtype;
  method public.shipping_method_catalog_revision%rowtype;
  confirmation public.order_shipping_readiness_confirmation%rowtype;
  sale_basis record;
  current_confirmation boolean := false;
  calculated_missing text[] := array[]::text[];
  calculated_blocking text[] := array[]::text[];
begin
  if not public.can_actor_access_shipping_order(target_order_id) then
    raise exception 'the session actor cannot access this shipping order'
      using errcode = '42501';
  end if;
  select orders.* into context_order
  from public.sales_order orders
  where orders.workspace_id = public.app_workspace_id() and orders.id = target_order_id;
  if context_order.id is null then
    raise exception 'shipping order is unavailable' using errcode = '42501';
  end if;

  select candidate.* into registration
  from public.order_registration_revision candidate
  where candidate.workspace_id = context_order.workspace_id
    and candidate.order_id = context_order.id
    and not exists (
      select 1 from public.order_registration_revision successor
      where successor.workspace_id = candidate.workspace_id
        and successor.order_id = candidate.order_id
        and successor.supersedes_id = candidate.id
    )
  order by candidate.revision desc limit 1;
  select candidate.* into selection
  from public.order_shipping_method_selection candidate
  where candidate.workspace_id = context_order.workspace_id
    and candidate.order_id = context_order.id
    and not exists (
      select 1 from public.order_shipping_method_selection successor
      where successor.workspace_id = candidate.workspace_id
        and successor.order_id = candidate.order_id
        and successor.supersedes_id = candidate.id
    )
  order by candidate.revision desc limit 1;
  if selection.id is not null then
    select candidate.* into method
    from public.shipping_method_catalog_revision candidate
    where candidate.workspace_id = selection.workspace_id
      and candidate.method_id = selection.method_id
      and candidate.id = selection.catalog_revision_id;
  end if;
  select * into sale_basis
  from public.collect_shipping_sale_basis(context_order.workspace_id, context_order.id);

  if registration.id is null then
    calculated_blocking := array_append(calculated_blocking, 'order_registration');
  elsif registration.channel_transaction_id is null then
    calculated_missing := array_append(calculated_missing, 'channel_transaction_id');
  end if;
  if sale_basis.active_sale_count = 0 then
    calculated_missing := array_append(calculated_missing, 'sale_amount');
  end if;
  if selection.id is null or registration.id is null
    or selection.registration_revision_id <> registration.id then
    calculated_blocking := array_append(calculated_blocking, 'shipping_method');
  end if;

  select candidate.* into confirmation
  from public.order_shipping_readiness_confirmation candidate
  where candidate.workspace_id = context_order.workspace_id
    and candidate.order_id = context_order.id
  order by candidate.confirmed_at desc, candidate.id desc limit 1;
  if confirmation.id is not null then
    current_confirmation := public.order_shipping_readiness_confirmation_is_current(
      context_order.workspace_id, context_order.id, confirmation.id
    );
  end if;

  return query select
    context_order.id,
    context_order.order_number,
    registration.id,
    registration.revision,
    registration.sales_channel_key,
    registration.sales_channel_name,
    case when registration.id is null then 'unregistered'
         when registration.channel_transaction_id is null then 'missing'
         else 'present' end,
    case when sale_basis.active_sale_count = 0 then 'missing' else 'present' end,
    selection.id,
    selection.revision,
    selection.supersedes_id,
    selection.method_id,
    selection.catalog_revision_id,
    method.method_name,
    method.tracking_available,
    selection.selected_fee_minor,
    method.delivery_estimate,
    method.official_checked_on,
    selection.selected_at,
    calculated_missing,
    calculated_blocking,
    case when confirmation.id is null then 'required'
         when current_confirmation then 'confirmed'
         else 'stale' end,
    confirmation.id,
    confirmation.confirmed_at;
end
$$;

create or replace function validate_shipment_human_confirmation() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := public.app_identity_id();
  order_created_at timestamptz;
  has_registration boolean;
  current_selection public.order_shipping_method_selection%rowtype;
  shipping_event public.financial_event%rowtype;
  financial_sku_id uuid;
  active_allocation_count integer;
  financial_tax_basis text;
  sale_fact_count integer;
  cost_fact_count integer;
  fee_fact_count integer;
  packaging_fact_count integer;
  distinct_tax_basis_count integer;
  mismatched_sku_count integer;
  shipping_event_count integer;
begin
  if actor_id is null or new.workspace_id is distinct from public.app_workspace_id()
    or not public.can_actor_access_shipping_order(new.order_id) then
    raise exception 'the session actor cannot confirm shipment for this order'
      using errcode = '42501';
  end if;
  select orders.created_at into order_created_at
  from public.sales_order orders
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

  select exists (
    select 1 from public.order_registration_revision registration
    where registration.workspace_id = new.workspace_id and registration.order_id = new.order_id
  ) into has_registration;
  if has_registration then
    if new.shipping_method_selection_id is null or new.readiness_confirmation_id is null
      or new.shipped_at is null then
      raise exception 'registered orders require human-confirmed shipping method and readiness'
        using errcode = '23514';
    end if;
    select selection.* into current_selection
    from public.order_shipping_method_selection selection
    where selection.workspace_id = new.workspace_id and selection.order_id = new.order_id
      and selection.id = new.shipping_method_selection_id
      and not exists (
        select 1 from public.order_shipping_method_selection successor
        where successor.workspace_id = selection.workspace_id
          and successor.order_id = selection.order_id
          and successor.supersedes_id = selection.id
      );
    if current_selection.id is null or not public.order_shipping_readiness_confirmation_is_current(
      new.workspace_id, new.order_id, new.readiness_confirmation_id
    ) or new.shipped_at < order_created_at
      or new.shipped_at > clock_timestamp() + interval '5 minutes' then
      raise exception 'shipment method, readiness confirmation or shipment time is stale'
        using errcode = '23514';
    end if;
    new.shipping_fee_minor := current_selection.selected_fee_minor;

    select count(*)::integer, (array_agg(unit.sku_id order by unit.sku_id))[1]
    into active_allocation_count, financial_sku_id
    from public.order_allocation allocation
    join public.inventory_unit unit
      on unit.workspace_id = allocation.workspace_id
     and unit.id = allocation.inventory_unit_id
    where allocation.workspace_id = new.workspace_id
      and allocation.order_id = new.order_id
      and allocation.active;
    if active_allocation_count <> 1 or financial_sku_id is null then
      raise exception 'registered shipment requires one active allocated SKU'
        using errcode = '23514';
    end if;

    select
      count(*) filter (where event.event_type = 'sale')::integer,
      count(*) filter (where event.event_type = 'cost')::integer,
      count(*) filter (where event.event_type = 'fee')::integer,
      count(*) filter (where event.event_type = 'packaging')::integer,
      count(distinct event.tax_basis)::integer,
      min(event.tax_basis),
      count(*) filter (where event.sku_id is distinct from financial_sku_id)::integer
    into sale_fact_count, cost_fact_count, fee_fact_count, packaging_fact_count,
      distinct_tax_basis_count, financial_tax_basis, mismatched_sku_count
    from public.financial_event event
    where event.workspace_id = new.workspace_id
      and event.order_id = new.order_id
      and event.event_type in ('sale', 'cost', 'fee', 'packaging')
      and event.reverses_event_id is null;
    if sale_fact_count > 1 or cost_fact_count <> 1 or fee_fact_count <> 1
      or packaging_fact_count <> 1 or distinct_tax_basis_count <> 1
      or mismatched_sku_count <> 0 then
      raise exception 'registered shipment financial facts are incomplete or inconsistent'
        using errcode = '23514';
    end if;

    select count(*)::integer into shipping_event_count
    from public.financial_event event
    where event.workspace_id = new.workspace_id
      and event.order_id = new.order_id
      and event.event_type = 'shipping';
    if shipping_event_count <> 0 then
      raise exception 'registered shipment cannot adopt a pre-existing shipping financial fact'
        using errcode = '23514';
    end if;
    insert into public.financial_event (
      workspace_id, sku_id, order_id, event_type, amount_minor, currency,
      tax_basis, bearer, source, source_meaning, rounding_rule_version,
      source_already_net, occurred_at
    ) values (
      new.workspace_id, financial_sku_id, new.order_id, 'shipping',
      current_selection.selected_fee_minor, 'JPY', financial_tax_basis, 'seller',
      'manual', '人が選択した配送方法の送料', 'jpy-v1', false, new.shipped_at
    ) returning * into shipping_event;
    new.shipping_financial_event_id := shipping_event.id;
  elsif new.shipping_method_selection_id is not null or new.readiness_confirmation_id is not null
    or new.shipping_fee_minor is not null or new.shipped_at is not null
    or new.shipping_financial_event_id is not null then
    raise exception 'legacy orders cannot receive partial P14 shipment evidence'
      using errcode = '23514';
  end if;

  new.confirmed_by := actor_id;
  new.confirmed_at := statement_timestamp();
  return new;
end
$$;

create or replace function audit_p14_order_contract_change() returns trigger
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid := public.app_identity_id();
  audit_action text;
  audit_target_type text;
  audit_target_id uuid;
  audit_fields text[];
  audit_after jsonb;
  audit_reason text;
begin
  if tg_table_name = 'order_registration_revision' then
    audit_action := 'order.registration.recorded';
    audit_target_type := 'sales_order';
    audit_target_id := new.order_id;
    audit_fields := array['sales_channel', 'channel_transaction_id_status', 'buyer_display_name_status', 'revision'];
    audit_after := jsonb_build_object(
      'salesChannelKey', new.sales_channel_key,
      'transactionIdStatus', case when new.channel_transaction_id is null then 'missing' else 'present' end,
      'buyerDisplayNameStatus', case when new.buyer_display_name is null then 'missing' else 'present' end,
      'revision', new.revision
    );
    audit_reason := 'order_registration_human_confirmed';
  elsif tg_table_name = 'shipping_method_catalog_revision' then
    audit_action := 'shipping.method_catalog.recorded';
    audit_target_type := 'shipping_method';
    audit_target_id := new.method_id;
    audit_fields := array['sales_channel', 'tracking', 'fee', 'official_checked_on', 'active', 'revision'];
    audit_after := jsonb_build_object(
      'salesChannelKey', new.sales_channel_key,
      'trackingAvailable', new.tracking_available,
      'feeRecorded', true,
      'officialCheckedOn', new.official_checked_on,
      'active', new.active,
      'revision', new.revision
    );
    audit_reason := 'shipping_method_catalog_human_confirmed';
  elsif tg_table_name = 'order_shipping_method_selection' then
    audit_action := 'order.shipping_method.selected';
    audit_target_type := 'sales_order';
    audit_target_id := new.order_id;
    audit_fields := array['shipping_method', 'fee', 'revision'];
    audit_after := jsonb_build_object(
      'methodId', new.method_id,
      'feeRecorded', true,
      'revision', new.revision
    );
    audit_reason := 'shipping_method_human_selected';
  else
    audit_action := 'order.shipping_readiness.confirmed';
    audit_target_type := 'sales_order';
    audit_target_id := new.order_id;
    audit_fields := array['missing_information', 'shipping_method', 'sale_amount_status'];
    audit_after := jsonb_build_object(
      'missingInformation', new.missing_information,
      'shippingMethodSelected', true,
      'saleAmountStatus', new.sale_amount_state
    );
    audit_reason := 'shipping_readiness_human_confirmed';
  end if;

  insert into public.audit_event (
    workspace_id, actor_id, action, target_type, target_id, field_names,
    redacted_changes, reason_code, approved_by
  ) values (
    new.workspace_id, actor_id, audit_action, audit_target_type, audit_target_id,
    audit_fields, jsonb_build_object('before', jsonb_build_object(), 'after', audit_after),
    audit_reason, actor_id
  );
  return new;
end
$$;

create trigger order_registration_revision_audit
after insert on order_registration_revision
for each row execute function audit_p14_order_contract_change();
create trigger shipping_method_catalog_revision_audit
after insert on shipping_method_catalog_revision
for each row execute function audit_p14_order_contract_change();
create trigger order_shipping_method_selection_audit
after insert on order_shipping_method_selection
for each row execute function audit_p14_order_contract_change();
create trigger order_shipping_readiness_confirmation_audit
after insert on order_shipping_readiness_confirmation
for each row execute function audit_p14_order_contract_change();

create trigger order_registration_revision_append_only
before update or delete on order_registration_revision
for each row execute function reject_shipping_preflight_history_mutation();
create trigger order_channel_transaction_claim_append_only
before update or delete on order_channel_transaction_claim
for each row execute function reject_shipping_preflight_history_mutation();
create trigger shipping_method_catalog_revision_append_only
before update or delete on shipping_method_catalog_revision
for each row execute function reject_shipping_preflight_history_mutation();
create trigger order_shipping_method_selection_append_only
before update or delete on order_shipping_method_selection
for each row execute function reject_shipping_preflight_history_mutation();
create trigger order_shipping_readiness_confirmation_append_only
before update or delete on order_shipping_readiness_confirmation
for each row execute function reject_shipping_preflight_history_mutation();

alter table order_number_counter enable row level security;
alter table order_number_counter force row level security;
create policy order_number_manager_access on order_number_counter
using (
  workspace_id = app_workspace_id()
  and exists (
    select 1 from workspace_membership membership
    where membership.workspace_id = order_number_counter.workspace_id
      and membership.identity_id = app_identity_id()
      and membership.active and membership.role in ('owner', 'inventory_manager')
  )
)
with check (
  workspace_id = app_workspace_id()
  and exists (
    select 1 from workspace_membership membership
    where membership.workspace_id = order_number_counter.workspace_id
      and membership.identity_id = app_identity_id()
      and membership.active and membership.role in ('owner', 'inventory_manager')
  )
);

alter table order_registration_revision enable row level security;
alter table order_registration_revision force row level security;
create policy order_registration_manager_access on order_registration_revision
using (
  workspace_id = app_workspace_id()
  and exists (
    select 1 from workspace_membership membership
    where membership.workspace_id = order_registration_revision.workspace_id
      and membership.identity_id = app_identity_id()
      and membership.active and membership.role in ('owner', 'inventory_manager')
  )
)
with check (
  workspace_id = app_workspace_id()
  and exists (
    select 1 from workspace_membership membership
    where membership.workspace_id = order_registration_revision.workspace_id
      and membership.identity_id = app_identity_id()
      and membership.active and membership.role in ('owner', 'inventory_manager')
  )
);

alter table order_channel_transaction_claim enable row level security;
alter table order_channel_transaction_claim force row level security;
create policy order_channel_transaction_claim_manager_access on order_channel_transaction_claim
using (
  workspace_id = app_workspace_id()
  and exists (
    select 1 from workspace_membership membership
    where membership.workspace_id = order_channel_transaction_claim.workspace_id
      and membership.identity_id = app_identity_id()
      and membership.active and membership.role in ('owner', 'inventory_manager')
  )
)
with check (
  workspace_id = app_workspace_id()
  and exists (
    select 1 from workspace_membership membership
    where membership.workspace_id = order_channel_transaction_claim.workspace_id
      and membership.identity_id = app_identity_id()
      and membership.active and membership.role in ('owner', 'inventory_manager')
  )
);

alter table shipping_method_catalog_revision enable row level security;
alter table shipping_method_catalog_revision force row level security;
create policy shipping_method_catalog_manager_access on shipping_method_catalog_revision
using (
  workspace_id = app_workspace_id()
  and exists (
    select 1 from workspace_membership membership
    where membership.workspace_id = shipping_method_catalog_revision.workspace_id
      and membership.identity_id = app_identity_id()
      and membership.active and membership.role in ('owner', 'inventory_manager')
  )
)
with check (
  workspace_id = app_workspace_id()
  and exists (
    select 1 from workspace_membership membership
    where membership.workspace_id = shipping_method_catalog_revision.workspace_id
      and membership.identity_id = app_identity_id()
      and membership.active and membership.role in ('owner', 'inventory_manager')
  )
);

alter table order_shipping_method_selection enable row level security;
alter table order_shipping_method_selection force row level security;
create policy shipping_method_selection_order_access on order_shipping_method_selection
using (
  workspace_id = app_workspace_id()
  and can_actor_access_shipping_order(order_id)
)
with check (
  workspace_id = app_workspace_id()
  and can_actor_access_shipping_order(order_id)
);

alter table order_shipping_readiness_confirmation enable row level security;
alter table order_shipping_readiness_confirmation force row level security;
create policy shipping_readiness_order_access on order_shipping_readiness_confirmation
using (
  workspace_id = app_workspace_id()
  and can_actor_access_shipping_order(order_id)
)
with check (
  workspace_id = app_workspace_id()
  and can_actor_access_shipping_order(order_id)
);

grant select, insert on order_registration_revision, shipping_method_catalog_revision
  to resale_app_runtime;

revoke select, insert on order_shipping_method_selection from resale_app_runtime;
revoke select, insert on order_shipping_readiness_confirmation from resale_app_runtime;

revoke update, delete on order_registration_revision, shipping_method_catalog_revision,
  order_shipping_method_selection, order_shipping_readiness_confirmation
  from resale_app_runtime;

revoke all on order_number_counter, order_channel_transaction_claim from resale_app_runtime;

revoke all on function issue_app_order_number() from public;
grant execute on function issue_app_order_number() to resale_app_runtime;
revoke all on function current_actor_shipping_method_options(uuid) from public;
grant execute on function current_actor_shipping_method_options(uuid) to resale_app_runtime;
revoke all on function record_order_shipping_method_selection(uuid, uuid, integer, uuid, text)
  from public;
grant execute on function record_order_shipping_method_selection(uuid, uuid, integer, uuid, text)
  to resale_app_runtime;
revoke all on function current_actor_shipping_method_selection_by_idempotency(uuid, uuid)
  from public;
grant execute on function current_actor_shipping_method_selection_by_idempotency(uuid, uuid)
  to resale_app_runtime;
revoke all on function current_actor_order_shipping_context(uuid) from public;
grant execute on function current_actor_order_shipping_context(uuid) to resale_app_runtime;
revoke all on function record_order_shipping_readiness_confirmation(
  uuid, integer, integer, text[], uuid, text
) from public;
grant execute on function record_order_shipping_readiness_confirmation(
  uuid, integer, integer, text[], uuid, text
) to resale_app_runtime;
revoke all on function order_shipping_readiness_confirmation_is_current(uuid, uuid, uuid)
  from public;
revoke all on function validate_order_registration_revision() from public;
revoke all on function guard_p14_shipping_financial_event() from public;
revoke all on function validate_shipping_method_catalog_revision() from public;
revoke all on function validate_order_shipping_method_selection() from public;
revoke all on function validate_order_shipping_readiness_confirmation() from public;
revoke all on function audit_p14_order_contract_change() from public;

commit;
