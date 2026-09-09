begin;

-- A receipt is uploaded before a SKU exists. Keep it separate from product photos.
create table receipt_media_asset (
  id uuid not null,
  workspace_id uuid not null references workspace(id),
  original_storage_key text not null,
  original_sha256 text not null check (original_sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text not null check (mime_type in ('image/jpeg','image/png')),
  size_bytes integer not null check (size_bytes between 1 and 26214400),
  width integer not null check (width between 1 and 12000),
  height integer not null check (height between 1 and 12000),
  confirmed_by uuid not null references app_identity(id),
  confirmed_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, id),
  unique (workspace_id, original_storage_key),
  check (original_storage_key = 'workspaces/' || workspace_id::text || '/originals/receipt-' || id::text ||
    case mime_type when 'image/jpeg' then '.jpg' else '.png' end)
);
alter table receipt_media_asset enable row level security;
alter table receipt_media_asset force row level security;
create policy workspace_isolation on receipt_media_asset
  using (workspace_id = app_workspace_id()) with check (workspace_id = app_workspace_id());
grant select, insert on receipt_media_asset to resale_app_runtime;

alter table receipt add column evidence_asset_id uuid;
alter table receipt add constraint receipt_private_original_fk
  foreign key (workspace_id, evidence_asset_id) references receipt_media_asset(workspace_id, id);
-- Legacy reference-only purchases remain readable and are never retroactively approved.
create unique index receipt_original_one_confirmation on receipt(workspace_id, evidence_asset_id)
  where evidence_asset_id is not null;

commit;
