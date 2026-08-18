begin;

create table media_asset (
  id uuid not null,
  workspace_id uuid not null references workspace(id),
  sku_id uuid not null,
  role text not null check (role in ('front', 'back', 'brand_tag', 'care_label', 'flaw')),
  original_sha256 text not null check (original_sha256 ~ '^[a-f0-9]{64}$'),
  original_storage_key text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  size_bytes integer not null check (size_bytes between 1 and 26214400),
  width integer not null check (width between 1 and 12000),
  height integer not null check (height between 1 and 12000),
  created_by uuid not null references app_identity(id),
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, original_storage_key),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id),
  check (original_storage_key like 'workspaces/' || workspace_id::text || '/originals/%')
);

create table measurement_attempt (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  sku_id uuid not null,
  definition_id text not null check (definition_id ~ '^[a-z][a-z0-9_]{1,63}$'),
  definition_version integer not null check (definition_version between 1 and 100),
  value numeric(7,2) not null check (value > 0 and value <= 250),
  unit text not null check (unit = 'cm'),
  basis text not null check (basis in ('flat_width', 'circumference', 'length')),
  state text not null check (state in ('natural', 'closed', 'unstretched')),
  measured_by uuid not null references app_identity(id),
  measured_at timestamptz not null,
  evidence_asset_id uuid not null,
  attempt integer not null check (attempt between 1 and 20),
  confirmed_by uuid not null references app_identity(id),
  confirmed_at timestamptz not null,
  requires_review boolean not null,
  difference_cm numeric(7,2),
  violations text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, sku_id, definition_id, attempt),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id),
  foreign key (workspace_id, evidence_asset_id) references media_asset(workspace_id, id),
  check (confirmed_by = measured_by),
  check ((requires_review and cardinality(violations) > 0) or (not requires_review and cardinality(violations) = 0))
);

alter table media_asset enable row level security;
alter table media_asset force row level security;
create policy media_asset_workspace_isolation on media_asset
  using (workspace_id = app_workspace_id())
  with check (workspace_id = app_workspace_id());

alter table measurement_attempt enable row level security;
alter table measurement_attempt force row level security;
create policy measurement_workspace_isolation on measurement_attempt
  using (workspace_id = app_workspace_id())
  with check (workspace_id = app_workspace_id());

commit;
