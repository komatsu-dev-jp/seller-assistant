begin;

create table p0_workflow (
  workspace_id uuid not null,
  sku_id uuid not null,
  state text not null default 'sku_created' check (state in (
    'sku_created', 'purchase_confirmed', 'capture_confirmed', 'listing_confirmed',
    'order_confirmed', 'picked', 'packed', 'shipped', 'journal_approved'
  )),
  last_action text check (last_action is null or last_action in (
    'confirm_purchase', 'confirm_capture', 'confirm_listing', 'confirm_order',
    'confirm_pick', 'confirm_pack', 'confirm_ship', 'approve_journal'
  )),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, sku_id),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id)
);

create table p0_workflow_action (
  workspace_id uuid not null,
  sku_id uuid not null,
  action text not null check (action in (
    'confirm_purchase', 'confirm_capture', 'confirm_listing', 'confirm_order',
    'confirm_pick', 'confirm_pack', 'confirm_ship', 'approve_journal'
  )),
  actor_id uuid not null references app_identity(id),
  evidence_reference_ids uuid[] not null check (cardinality(evidence_reference_ids) between 1 and 20),
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  response_state text not null,
  response_version integer not null check (response_version > 1),
  created_at timestamptz not null default now(),
  primary key (workspace_id, sku_id, idempotency_key),
  foreign key (workspace_id, sku_id) references p0_workflow(workspace_id, sku_id)
);

alter table p0_workflow enable row level security;
alter table p0_workflow force row level security;
create policy workspace_isolation on p0_workflow
  using (workspace_id = app_workspace_id())
  with check (workspace_id = app_workspace_id());

alter table p0_workflow_action enable row level security;
alter table p0_workflow_action force row level security;
create policy workspace_isolation on p0_workflow_action
  using (workspace_id = app_workspace_id())
  with check (workspace_id = app_workspace_id());

commit;
