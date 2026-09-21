begin;

create table published_product_page (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null,
  sku_id uuid not null,
  sales_channel_key text not null check (sales_channel_key = 'mercari'),
  sales_channel_name text not null check (sales_channel_name = 'メルカリ'),
  product_id text not null check (product_id ~ '^m[0-9]{9,20}$'),
  product_url text not null,
  confirmed_by uuid not null,
  confirmed_at timestamptz not null default statement_timestamp(),
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  primary key (workspace_id, id),
  unique (workspace_id, sku_id, sales_channel_key),
  unique (workspace_id, sales_channel_key, product_id),
  unique (workspace_id, idempotency_key),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id),
  foreign key (workspace_id, confirmed_by)
    references workspace_membership(workspace_id, identity_id),
  check (product_url = 'https://jp.mercari.com/item/' || product_id)
);

alter table published_product_page enable row level security;
alter table published_product_page force row level security;
create policy workspace_isolation on published_product_page
  using (workspace_id = app_workspace_id())
  with check (workspace_id = app_workspace_id());

create function reject_published_product_page_mutation() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'published product page is immutable' using errcode = '23514';
end $$;

create trigger published_product_page_immutable
before update or delete on published_product_page
for each row execute function reject_published_product_page_mutation();

revoke all on function reject_published_product_page_mutation() from public;
grant select, insert on published_product_page to resale_app_runtime;

commit;
