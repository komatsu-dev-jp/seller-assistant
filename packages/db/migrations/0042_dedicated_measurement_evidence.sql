begin;

alter table media_asset drop constraint media_asset_role_check;
alter table media_asset add constraint media_asset_role_check
  check (role in ('front','back','brand_tag','care_label','flaw','measurement_evidence'));
alter table media_asset add column measurement_definition_id text;
alter table media_asset add constraint media_asset_measurement_definition_check check (
  (role = 'measurement_evidence' and measurement_definition_id is not null
    and measurement_definition_id ~ '^[a-z][a-z0-9_]{1,63}$') or
  (role <> 'measurement_evidence' and measurement_definition_id is null)
);

create function validate_dedicated_measurement_evidence() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
declare evidence public.media_asset%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(new.workspace_id::text), hashtext(new.sku_id::text));
  select * into evidence from public.media_asset
  where workspace_id = new.workspace_id and sku_id = new.sku_id and id = new.evidence_asset_id;
  if not found or evidence.role <> 'measurement_evidence'
    or evidence.measurement_definition_id <> new.definition_id then
    raise exception 'New measurements require dedicated evidence for this SKU and definition' using errcode = '23514';
  end if;
  if exists (select 1 from public.media_asset other where other.workspace_id = new.workspace_id
    and other.sku_id = new.sku_id and other.id <> evidence.id
    and other.original_sha256 = evidence.original_sha256) then
    raise exception 'Measurement evidence must not reuse another product photo' using errcode = '23514';
  end if;
  if exists (select 1 from public.measurement_attempt other where other.workspace_id = new.workspace_id
    and other.evidence_asset_id = new.evidence_asset_id) then
    raise exception 'Measurement evidence belongs to one attempt only' using errcode = '23514';
  end if;
  if new.attempt <> coalesce((select max(attempt) from public.measurement_attempt
    where workspace_id = new.workspace_id and sku_id = new.sku_id and definition_id = new.definition_id), 0) + 1 then
    raise exception 'Measurement attempts must advance from the current version' using errcode = '23514';
  end if;
  return new;
end $$;
-- Historical attempts are retained without rewriting or retroactively approving them.
create trigger measurement_dedicated_evidence_guard before insert on measurement_attempt
for each row execute function validate_dedicated_measurement_evidence();

create function validate_measurement_media_uniqueness() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.workspace_id::text), hashtext(new.sku_id::text));
  if exists (select 1 from public.media_asset other where other.workspace_id = new.workspace_id
    and other.sku_id = new.sku_id and other.original_sha256 = new.original_sha256
    and (new.role = 'measurement_evidence' or other.role = 'measurement_evidence')) then
    raise exception 'Dedicated measurement media cannot share original bytes with another photo' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger measurement_media_uniqueness_guard before insert on media_asset
for each row execute function validate_measurement_media_uniqueness();

commit;
