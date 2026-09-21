begin;

create table sales_check_observation (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null,
  sku_id uuid not null,
  sales_channel_key text not null default 'mercari' check (sales_channel_key = 'mercari'),
  listing_days integer check (listing_days >= 0),
  current_price_yen integer check (current_price_yen >= 0),
  view_count integer check (view_count >= 0),
  search_count integer check (search_count >= 0),
  like_count integer check (like_count >= 0),
  price_reduction_request_count integer check (price_reduction_request_count >= 0),
  checked_on date not null check (checked_on between date '0001-01-01' and date '9999-12-31'),
  next_check_on date not null check (next_check_on between date '0001-01-01' and date '9999-12-31'),
  input_source text not null check (input_source = 'official_page_human_checked'),
  confirmed_by uuid not null,
  saved_at timestamptz not null default clock_timestamp(),
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  primary key (workspace_id, id),
  unique (workspace_id, idempotency_key),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id),
  foreign key (workspace_id, sku_id, sales_channel_key)
    references published_product_page(workspace_id, sku_id, sales_channel_key),
  foreign key (workspace_id, confirmed_by)
    references workspace_membership(workspace_id, identity_id)
);

create index sales_check_observation_latest on sales_check_observation
  (workspace_id, sku_id, saved_at desc, id desc);
alter table sales_check_observation enable row level security;
alter table sales_check_observation force row level security;
create policy workspace_isolation on sales_check_observation
  using (workspace_id = app_workspace_id())
  with check (workspace_id = app_workspace_id());

create function reject_sales_check_observation_mutation() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'sales check observation is immutable' using errcode = '23514';
end $$;
create trigger sales_check_observation_immutable
before update or delete on sales_check_observation
for each row execute function reject_sales_check_observation_mutation();
revoke all on function reject_sales_check_observation_mutation() from public;
grant select, insert on sales_check_observation to resale_app_runtime;

commit;
