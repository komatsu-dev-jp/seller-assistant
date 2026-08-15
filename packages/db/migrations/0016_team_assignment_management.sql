begin;

alter table inventory_label
  drop constraint inventory_label_workspace_id_short_code_active_key;
create unique index inventory_label_one_active_short_code
  on inventory_label(workspace_id, short_code) where active;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select relation.relname as table_name, constraint_name.conname
    from pg_constraint constraint_name
    join pg_class relation on relation.oid = constraint_name.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in ('work_assignment', 'sku_work_assignment', 'order_assignment')
      and constraint_name.contype = 'c'
      and pg_get_constraintdef(constraint_name.oid) like '%revoked_at%starts_at%'
  loop
    execute format('alter table %I drop constraint %I', constraint_row.table_name, constraint_row.conname);
  end loop;
end $$;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select relation.relname as table_name, constraint_name.conname
    from pg_constraint constraint_name
    join pg_class relation on relation.oid = constraint_name.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in ('work_assignment', 'sku_work_assignment')
      and constraint_name.contype = 'c'
      and pg_get_constraintdef(constraint_name.oid) like '%expires_at > starts_at%'
  loop
    execute format('alter table %I drop constraint %I', constraint_row.table_name, constraint_row.conname);
  end loop;
end $$;

update work_assignment
set expires_at = starts_at + interval '24 hours'
where expires_at > starts_at + interval '24 hours';
update sku_work_assignment
set expires_at = starts_at + interval '24 hours'
where expires_at > starts_at + interval '24 hours';

alter table work_assignment add constraint work_assignment_period_check
  check (expires_at > starts_at and expires_at <= starts_at + interval '24 hours');
alter table sku_work_assignment add constraint sku_work_assignment_period_check
  check (expires_at > starts_at and expires_at <= starts_at + interval '24 hours');

alter table work_assignment add constraint work_assignment_revoked_at_check
  check (revoked_at is null or revoked_at >= created_at);
alter table sku_work_assignment add constraint sku_work_assignment_revoked_at_check
  check (revoked_at is null or revoked_at >= created_at);
alter table order_assignment add constraint order_assignment_revoked_at_check
  check (revoked_at is null or revoked_at >= created_at);

create table inventory_unit_assignment (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  identity_id uuid not null references app_identity(id),
  inventory_unit_id uuid not null,
  operation text not null check (operation = 'putaway'),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references app_identity(id),
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, inventory_unit_id)
    references inventory_unit(workspace_id, id),
  check (expires_at > starts_at and expires_at <= starts_at + interval '24 hours'),
  check (revoked_at is null or revoked_at >= created_at)
);

create index inventory_unit_assignment_active_lookup
on inventory_unit_assignment(workspace_id, identity_id, operation, inventory_unit_id, expires_at)
where revoked_at is null;

alter table inventory_unit_assignment enable row level security;
alter table inventory_unit_assignment force row level security;
create policy workspace_isolation on inventory_unit_assignment
using (workspace_id = app_workspace_id())
with check (workspace_id = app_workspace_id());

create or replace function has_active_inventory_unit_assignment(
  requested_workspace_id uuid,
  requested_identity_id uuid,
  requested_operation text,
  requested_inventory_unit_id uuid,
  requested_at timestamptz default now()
) returns boolean
language sql stable
as $$
  select exists (
    select 1 from inventory_unit_assignment assignment
    where assignment.workspace_id = requested_workspace_id
      and assignment.identity_id = requested_identity_id
      and assignment.operation = requested_operation
      and assignment.inventory_unit_id = requested_inventory_unit_id
      and assignment.starts_at <= requested_at
      and assignment.expires_at > requested_at
      and assignment.revoked_at is null
  )
$$;

create or replace function app_is_assignment_manager(
  requested_workspace_id uuid,
  requested_actor_id uuid,
  owner_only boolean default false
) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from workspace_membership membership
    where membership.workspace_id = requested_workspace_id
      and membership.identity_id = requested_actor_id
      and membership.active
      and (
        membership.role = 'owner'
        or (not owner_only and membership.role = 'inventory_manager')
      )
  )
$$;

create or replace function app_create_local_member(
  requested_workspace_id uuid,
  requested_actor_id uuid,
  new_identity_id uuid,
  new_display_name text,
  new_email text,
  new_role text,
  new_password_hash bytea,
  new_password_salt bytea,
  new_scrypt_n integer,
  new_scrypt_r integer,
  new_scrypt_p integer
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not app_is_assignment_manager(requested_workspace_id, requested_actor_id, true) then
    raise exception 'owner role is required';
  end if;
  if new_role not in ('inventory_manager', 'field_worker', 'shipping', 'accounting') then
    raise exception 'unsupported member role';
  end if;
  insert into app_identity(id, display_name) values (new_identity_id, new_display_name);
  insert into auth_credential(
    identity_id, email_normalized, password_hash, password_salt,
    hash_algorithm, scrypt_n, scrypt_r, scrypt_p
  ) values (
    new_identity_id, lower(btrim(new_email)), new_password_hash, new_password_salt,
    'scrypt-v1', new_scrypt_n, new_scrypt_r, new_scrypt_p
  );
  insert into workspace_membership(workspace_id, identity_id, role, active)
  values (requested_workspace_id, new_identity_id, new_role, true);
  return new_identity_id;
end $$;

create or replace function app_create_team_assignment(
  requested_workspace_id uuid,
  requested_actor_id uuid,
  requested_identity_id uuid,
  requested_assignment_type text,
  requested_target_id uuid,
  requested_starts_at timestamptz,
  requested_expires_at timestamptz
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  created_id uuid;
begin
  if not app_is_assignment_manager(requested_workspace_id, requested_actor_id, false) then
    raise exception 'assignment manager role is required';
  end if;
  if requested_expires_at <= requested_starts_at
     or requested_expires_at > requested_starts_at + interval '24 hours' then
    raise exception 'invalid assignment period';
  end if;
  if not exists (
    select 1 from workspace_membership membership
    where membership.workspace_id = requested_workspace_id
      and membership.identity_id = requested_identity_id
      and membership.active and membership.role = 'field_worker'
  ) then
    raise exception 'active field worker is required';
  end if;

  if requested_assignment_type = 'capture' then
    insert into sku_work_assignment(
      workspace_id, identity_id, sku_id, operation, starts_at, expires_at, created_by
    ) values (
      requested_workspace_id, requested_identity_id, requested_target_id, 'capture',
      requested_starts_at, requested_expires_at, requested_actor_id
    ) returning id into created_id;
  elsif requested_assignment_type = 'location_putaway' then
    insert into work_assignment(
      workspace_id, identity_id, location_root_id, operation,
      starts_at, expires_at, created_by
    ) values (
      requested_workspace_id, requested_identity_id, requested_target_id, 'putaway',
      requested_starts_at, requested_expires_at, requested_actor_id
    ) returning id into created_id;
  elsif requested_assignment_type = 'location_photo' then
    insert into work_assignment(
      workspace_id, identity_id, location_root_id, operation,
      starts_at, expires_at, created_by
    ) values (
      requested_workspace_id, requested_identity_id, requested_target_id, 'photo',
      requested_starts_at, requested_expires_at, requested_actor_id
    ) returning id into created_id;
  elsif requested_assignment_type = 'inventory_putaway' then
    insert into inventory_unit_assignment(
      workspace_id, identity_id, inventory_unit_id, operation,
      starts_at, expires_at, created_by
    ) values (
      requested_workspace_id, requested_identity_id, requested_target_id, 'putaway',
      requested_starts_at, requested_expires_at, requested_actor_id
    ) returning id into created_id;
  else
    raise exception 'unsupported assignment type';
  end if;
  return created_id;
end $$;

create or replace function app_revoke_team_assignment(
  requested_workspace_id uuid,
  requested_actor_id uuid,
  requested_assignment_type text,
  requested_assignment_id uuid
) returns timestamptz
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  revoked_time timestamptz := statement_timestamp();
begin
  if not app_is_assignment_manager(requested_workspace_id, requested_actor_id, false) then
    raise exception 'assignment manager role is required';
  end if;
  if requested_assignment_type = 'capture' then
    update sku_work_assignment set revoked_at = revoked_time
    where workspace_id = requested_workspace_id and id = requested_assignment_id
      and revoked_at is null;
  elsif requested_assignment_type = 'location_putaway' then
    update work_assignment set revoked_at = revoked_time
    where workspace_id = requested_workspace_id and id = requested_assignment_id
      and operation = 'putaway'
      and revoked_at is null;
  elsif requested_assignment_type = 'location_photo' then
    update work_assignment set revoked_at = revoked_time
    where workspace_id = requested_workspace_id and id = requested_assignment_id
      and operation = 'photo' and revoked_at is null;
  elsif requested_assignment_type = 'inventory_putaway' then
    update inventory_unit_assignment set revoked_at = revoked_time
    where workspace_id = requested_workspace_id and id = requested_assignment_id
      and revoked_at is null;
  elsif requested_assignment_type = 'shipping' then
    update order_assignment set revoked_at = revoked_time
    where workspace_id = requested_workspace_id and id = requested_assignment_id
      and revoked_at is null;
  else
    raise exception 'unsupported assignment type';
  end if;
  if not found then raise exception 'active assignment was not found'; end if;
  return revoked_time;
end $$;

revoke all on function has_active_inventory_unit_assignment(uuid, uuid, text, uuid, timestamptz)
from public;
revoke all on function app_is_assignment_manager(uuid, uuid, boolean) from public;
revoke all on function app_create_local_member(uuid, uuid, uuid, text, text, text, bytea, bytea, integer, integer, integer)
from public;
revoke all on function app_create_team_assignment(uuid, uuid, uuid, text, uuid, timestamptz, timestamptz)
from public;
revoke all on function app_revoke_team_assignment(uuid, uuid, text, uuid) from public;

grant execute on function has_active_inventory_unit_assignment(uuid, uuid, text, uuid, timestamptz)
to resale_app_runtime;
grant execute on function app_is_assignment_manager(uuid, uuid, boolean) to resale_app_runtime;
grant execute on function app_create_local_member(uuid, uuid, uuid, text, text, text, bytea, bytea, integer, integer, integer)
to resale_app_runtime;
grant execute on function app_create_team_assignment(uuid, uuid, uuid, text, uuid, timestamptz, timestamptz)
to resale_app_runtime;
grant execute on function app_revoke_team_assignment(uuid, uuid, text, uuid) to resale_app_runtime;
grant select on inventory_unit_assignment to resale_app_runtime;

comment on table inventory_unit_assignment is
  'Time-bounded assignment to one physical inventory unit. A location assignment alone never grants access to another item.';

commit;
