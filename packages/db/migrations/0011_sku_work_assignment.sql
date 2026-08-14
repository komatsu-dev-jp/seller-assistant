begin;

create table sku_work_assignment (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  identity_id uuid not null references app_identity(id),
  sku_id uuid not null,
  operation text not null check (operation in ('capture')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references app_identity(id),
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, sku_id) references product_sku(workspace_id, id),
  check (expires_at > starts_at),
  check (revoked_at is null or revoked_at >= starts_at)
);

create index sku_work_assignment_active_lookup
on sku_work_assignment(workspace_id, identity_id, operation, sku_id, expires_at)
where revoked_at is null;

alter table sku_work_assignment enable row level security;
alter table sku_work_assignment force row level security;
create policy workspace_isolation on sku_work_assignment
  using (workspace_id = app_workspace_id())
  with check (workspace_id = app_workspace_id());

create or replace function has_active_sku_work_assignment(
  requested_workspace_id uuid,
  requested_identity_id uuid,
  requested_operation text,
  requested_sku_id uuid,
  requested_at timestamptz default now()
) returns boolean
language sql stable
as $$
  select exists (
    select 1
    from sku_work_assignment assignment
    where assignment.workspace_id = requested_workspace_id
      and assignment.identity_id = requested_identity_id
      and assignment.operation = requested_operation
      and assignment.sku_id = requested_sku_id
      and assignment.starts_at <= requested_at
      and assignment.expires_at > requested_at
      and assignment.revoked_at is null
  )
$$;

revoke all on function has_active_sku_work_assignment(uuid, uuid, text, uuid, timestamptz)
from public;
grant execute on function has_active_sku_work_assignment(uuid, uuid, text, uuid, timestamptz)
to resale_app_runtime;
grant select on sku_work_assignment to resale_app_runtime;

comment on table sku_work_assignment is
  'Time-bounded human assignment to one SKU and one operation. Workspace membership alone never grants field access.';

commit;
