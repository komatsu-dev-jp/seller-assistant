begin;

-- Purpose is immutable, but an empty quarantine location can be suspended or retired.
-- Inventory writes lock their destination row; this UPDATE holds the same row lock.
alter table location_node drop constraint quarantine_location_storage_check;
alter table location_node add constraint quarantine_location_storage_check
  check (purpose <> 'return_quarantine' or can_store_inventory);

create function guard_location_storage_lifecycle() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if (new.state <> 'active' or not new.can_store_inventory) and exists (
    select 1 from public.inventory_unit where workspace_id=new.workspace_id and location_id=new.id
      and status not in ('shipped','lost','disposed')
  ) then
    raise exception 'occupied location cannot be suspended or retired' using errcode='23514';
  end if;
  return new;
end $$;
create trigger location_storage_lifecycle_guard before update of state,can_store_inventory on location_node
for each row execute function guard_location_storage_lifecycle();

create or replace function guard_scan_location_purpose() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare destination public.location_node%rowtype;
begin
  select * into destination from public.location_node
    where workspace_id=new.workspace_id and id=new.destination_location_id for share;
  if not found or destination.state <> 'active' or not destination.can_store_inventory then
    raise exception 'scan destination is inactive or unavailable' using errcode='23514';
  end if;
  if (new.operation='return_quarantine' and destination.purpose <> 'return_quarantine') or
     (new.operation <> 'return_quarantine' and destination.purpose='return_quarantine') then
    raise exception 'scan operation is incompatible with location purpose' using errcode='23514';
  end if;
  return new;
end $$;

commit;
