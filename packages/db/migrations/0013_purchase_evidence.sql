begin;

create table purchase_batch (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  supplier_name text not null check (char_length(supplier_name) between 1 and 160),
  purchased_at timestamptz not null,
  confirmed_by uuid not null references app_identity(id),
  created_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table receipt (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  purchase_batch_id uuid not null,
  receipt_reference text not null check (char_length(receipt_reference) between 1 and 120),
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null default 'JPY' check (currency = 'JPY'),
  source_kind text not null default 'human_entered_reference'
    check (source_kind = 'human_entered_reference'),
  confirmed_by uuid not null references app_identity(id),
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, receipt_reference),
  foreign key (workspace_id, purchase_batch_id) references purchase_batch(workspace_id, id)
);

create table cost_allocation (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  receipt_id uuid not null,
  sku_id uuid not null,
  allocated_amount_minor bigint not null check (allocated_amount_minor >= 0),
  allocation_method text not null default 'single_sku_full_or_partial'
    check (allocation_method = 'single_sku_full_or_partial'),
  confirmed_by uuid not null references app_identity(id),
  confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, receipt_id, sku_id),
  foreign key (workspace_id, receipt_id) references receipt(workspace_id, id),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id)
);

do $$
declare table_name text;
begin
  foreach table_name in array array['purchase_batch', 'receipt', 'cost_allocation'] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('alter table %I force row level security', table_name);
    execute format(
      'create policy workspace_isolation on %I using (workspace_id = app_workspace_id()) with check (workspace_id = app_workspace_id())',
      table_name
    );
  end loop;
end $$;

grant select, insert on purchase_batch, receipt, cost_allocation to resale_app_runtime;

commit;
