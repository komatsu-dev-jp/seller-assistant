begin;

alter table location_photo
  add column captured_by uuid not null references app_identity(id),
  add column captured_at timestamptz not null,
  add column original_sha256 text not null check (original_sha256 ~ '^[a-f0-9]{64}$'),
  add column original_storage_key text not null,
  add column original_mime_type text not null check (
    original_mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic')
  ),
  add column original_size_bytes integer not null check (
    original_size_bytes between 1 and 26214400
  ),
  add column original_width integer not null check (original_width between 1 and 12000),
  add column original_height integer not null check (original_height between 1 and 12000),
  add column derivative_sha256 text check (
    derivative_sha256 is null or derivative_sha256 ~ '^[a-f0-9]{64}$'
  ),
  add column derivative_storage_key text,
  add column reviewed_by uuid references app_identity(id),
  add column reviewed_at timestamptz,
  add column rejection_reason text check (
    rejection_reason is null or char_length(rejection_reason) between 1 and 500
  );

alter table location_photo
  add constraint location_photo_original_key_scope check (
    original_storage_key like 'workspaces/' || workspace_id::text || '/location-originals/%'
    and original_storage_key not like '%..%'
  ),
  add constraint location_photo_derivative_key_scope check (
    derivative_storage_key is null
    or (
      derivative_storage_key like 'workspaces/' || workspace_id::text || '/location-display/%'
      and derivative_storage_key not like '%..%'
    )
  ),
  add constraint location_photo_review_contract check (
    (
      review_state = 'pending'
      and derivative_asset_id is null
      and derivative_sha256 is null
      and derivative_storage_key is null
      and reviewed_by is null
      and reviewed_at is null
      and rejection_reason is null
    )
    or (
      review_state = 'rejected'
      and derivative_asset_id is null
      and derivative_sha256 is null
      and derivative_storage_key is null
      and reviewed_by is not null
      and reviewed_at is not null
      and rejection_reason is not null
      and reviewed_by <> captured_by
    )
    or (
      review_state = 'approved'
      and derivative_asset_id is not null
      and derivative_sha256 is not null
      and derivative_storage_key is not null
      and reviewed_by is not null
      and reviewed_at is not null
      and rejection_reason is null
      and gps_exif_count = 0
      and reviewed_by <> captured_by
    )
  );

create or replace function protect_location_photo_original() returns trigger
language plpgsql as $$
begin
  if row(
    old.workspace_id, old.location_id, old.photo_kind, old.original_asset_id,
    old.captured_by, old.captured_at, old.original_sha256, old.original_storage_key,
    old.original_mime_type, old.original_size_bytes, old.original_width, old.original_height
  ) is distinct from row(
    new.workspace_id, new.location_id, new.photo_kind, new.original_asset_id,
    new.captured_by, new.captured_at, new.original_sha256, new.original_storage_key,
    new.original_mime_type, new.original_size_bytes, new.original_width, new.original_height
  ) then
    raise exception 'location photo original metadata is immutable';
  end if;
  return new;
end $$;

create trigger location_photo_original_immutable
before update on location_photo
for each row execute function protect_location_photo_original();

comment on table location_photo is
  'Private location-photo metadata. Only separately reviewed, zero-GPS derivatives are displayable.';

commit;
