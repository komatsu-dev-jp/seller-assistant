begin;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select relation.relname as table_name, constraint_name.conname
    from pg_constraint constraint_name
    join pg_class relation on relation.oid = constraint_name.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = 'measurement_attempt'
      and constraint_name.contype = 'c'
      and pg_get_constraintdef(constraint_name.oid) like '%requires_review%violations%'
  loop
    execute format('alter table %I drop constraint %I', constraint_row.table_name, constraint_row.conname);
  end loop;
end $$;

alter table measurement_attempt add column review_reason_code text
  check (review_reason_code is null or review_reason_code in (
    'garment_stretch', 'measurement_definition_corrected', 'previous_entry_error'
  ));
alter table measurement_attempt add constraint measurement_review_state_check
  check (
    (requires_review and cardinality(violations) > 0 and review_reason_code is null)
    or (not requires_review and cardinality(violations) = 0)
  );

create table product_identity_candidate (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  sku_id uuid not null,
  source_asset_id uuid not null,
  source_text_sha256 char(64) not null check (source_text_sha256 ~ '^[a-f0-9]{64}$'),
  brand_candidate text,
  model_candidate text,
  material_candidate text,
  size_candidate text,
  source_kind text not null check (source_kind = 'manual_ocr_text'),
  status text not null default 'candidate' check (status in ('candidate','human_confirmed','rejected')),
  created_by uuid not null references app_identity(id),
  confirmed_by uuid references app_identity(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id),
  foreign key (workspace_id, source_asset_id) references media_asset(workspace_id, id),
  check ((status = 'candidate' and confirmed_by is null and confirmed_at is null)
    or (status <> 'candidate' and confirmed_by is not null and confirmed_at is not null))
);

create table marketplace_reference (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  sku_id uuid not null,
  source_url text not null check (source_url ~ '^https://'),
  displayed_price_minor integer not null check (displayed_price_minor >= 0),
  sold_state boolean not null,
  item_condition text not null check (char_length(item_condition) between 1 and 80),
  shipping_basis text not null check (shipping_basis in ('included','separate','unknown')),
  included boolean not null,
  exclusion_reason text,
  checked_at timestamptz not null,
  created_by uuid not null references app_identity(id),
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id),
  check (included or exclusion_reason is not null)
);

alter table product_identity_candidate enable row level security;
alter table product_identity_candidate force row level security;
create policy workspace_isolation on product_identity_candidate
using (workspace_id = app_workspace_id()) with check (workspace_id = app_workspace_id());

alter table marketplace_reference enable row level security;
alter table marketplace_reference force row level security;
create policy workspace_isolation on marketplace_reference
using (workspace_id = app_workspace_id()) with check (workspace_id = app_workspace_id());

grant select, insert, update on product_identity_candidate, marketplace_reference
to resale_app_runtime;

comment on table product_identity_candidate is
  'Candidate fields derived from text the user copied from on-device OCR. Raw OCR text is hashed, not stored, and never auto-confirms identity.';
comment on table marketplace_reference is
  'Human-entered official-page evidence. The app never fetches or scrapes the source URL.';

commit;
