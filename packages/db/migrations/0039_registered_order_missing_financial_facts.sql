begin;

-- Registered order entry does not collect selling fees or packaging costs.
-- Shipment therefore requires the one known cost fact, accepts each optional
-- sale/fee/packaging fact at most once, and never fabricates a missing amount.
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
    if sale_fact_count > 1 or cost_fact_count <> 1 or fee_fact_count > 1
      or packaging_fact_count > 1 or distinct_tax_basis_count <> 1
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

revoke all on function validate_shipment_human_confirmation() from public;

commit;
