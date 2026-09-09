begin;

alter table location_node add column purpose text not null default 'general'
  check (purpose in ('general','return_quarantine'));
alter table location_node add constraint quarantine_location_storage_check
  check (purpose <> 'return_quarantine' or (state='active' and can_store_inventory));

create function guard_inventory_location_purpose() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare destination_purpose text;
begin
  if new.location_id is null then
    if new.status='quarantined' then raise exception 'quarantined inventory requires a quarantine location' using errcode='23514'; end if;
    return new;
  end if;
  select purpose into destination_purpose from public.location_node
    where workspace_id=new.workspace_id and id=new.location_id for share;
  if (new.status='quarantined' and destination_purpose is distinct from 'return_quarantine') or
     (new.status in ('available','reserved','picked','packed','putaway_pending') and destination_purpose='return_quarantine') then
    raise exception 'inventory status is incompatible with location purpose' using errcode='23514';
  end if;
  return new;
end $$;
create trigger inventory_location_purpose_guard before insert or update on inventory_unit
for each row execute function guard_inventory_location_purpose();

create function guard_location_purpose_change() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
  if new.purpose is distinct from old.purpose then
    raise exception 'location purpose is immutable; create a separate quarantine location' using errcode='23514';
  end if;
  return new;
end $$;
create trigger location_purpose_immutable_guard before update of purpose on location_node
for each row execute function guard_location_purpose_change();

create function guard_scan_location_purpose() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
declare destination_purpose text;
begin
  select purpose into destination_purpose from public.location_node
    where workspace_id=new.workspace_id and id=new.destination_location_id for share;
  if (new.operation='return_quarantine' and destination_purpose is distinct from 'return_quarantine') or
     (new.operation <> 'return_quarantine' and destination_purpose='return_quarantine') then
    raise exception 'scan operation is incompatible with location purpose' using errcode='23514';
  end if;
  return new;
end $$;
create trigger scan_location_purpose_guard before insert on scan_session
for each row execute function guard_scan_location_purpose();

alter table order_operation_record drop constraint order_operation_record_response_inventory_status_check;
alter table order_operation_record add constraint order_operation_record_response_inventory_status_check
  check (response_inventory_status in ('reserved','picked','packed','shipped','quarantined','available','disposal_pending','putaway_pending'));

create or replace function apply_return_inspection() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare unit_row public.inventory_unit%rowtype; order_state text;
begin
  select * into unit_row from public.inventory_unit where workspace_id=new.workspace_id and id=new.inventory_unit_id for update;
  select state into order_state from public.sales_order where workspace_id=new.workspace_id and id=new.order_id;
  if unit_row.status <> 'quarantined' or order_state <> 'returned' then
    raise exception 'return inspection requires quarantined inventory and returned order' using errcode='23514';
  end if;
  -- Inspection is not a physical general-location scan. Restock stays unavailable until ordinary putaway.
  update public.inventory_unit set
    status=case when new.resolution='restock' then 'putaway_pending'::public.inventory_status else 'disposal_pending'::public.inventory_status end,
    location_id=case when new.resolution='restock' then null else location_id end
    where workspace_id=new.workspace_id and id=new.inventory_unit_id;
  if new.resolution='restock' then
    insert into public.audit_event(workspace_id,actor_id,action,target_type,target_id,field_names,redacted_changes,reference_ids,reason_code,approved_by)
    values(new.workspace_id,new.confirmed_by,'return.restock_waits_for_putaway','inventory_unit',new.inventory_unit_id,
      array['status','location_id'],jsonb_build_object('before',jsonb_build_object('status','quarantined'),
        'after',jsonb_build_object('status','putaway_pending','location','unconfirmed')),
      array[new.order_id,new.id,unit_row.location_id],'human_inspected_general_putaway_required',new.confirmed_by);
  end if;
  return new;
end $$;

commit;
