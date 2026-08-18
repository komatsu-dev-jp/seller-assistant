begin;

create table work_assignment (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  identity_id uuid not null references app_identity(id),
  location_root_id uuid not null,
  operation text not null check (operation in ('putaway', 'move', 'pick', 'count', 'photo')),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references app_identity(id),
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, location_root_id) references location_node(workspace_id, id),
  check (expires_at > starts_at),
  check (revoked_at is null or revoked_at >= starts_at)
);

create index work_assignment_active_lookup
on work_assignment(workspace_id, identity_id, operation, location_root_id, expires_at)
where revoked_at is null;

alter table work_assignment enable row level security;
alter table work_assignment force row level security;
create policy workspace_isolation on work_assignment
  using (workspace_id = app_workspace_id())
  with check (workspace_id = app_workspace_id());

create or replace function has_active_work_assignment(
  requested_workspace_id uuid,
  requested_identity_id uuid,
  requested_operation text,
  requested_location_id uuid,
  requested_at timestamptz default now()
) returns boolean
language sql stable
as $$
  with recursive location_ancestors(id, parent_id) as (
    select location.id, location.parent_id
    from location_node location
    where location.workspace_id = requested_workspace_id
      and location.id = requested_location_id
    union all
    select parent.id, parent.parent_id
    from location_node parent
    join location_ancestors child on child.parent_id = parent.id
    where parent.workspace_id = requested_workspace_id
  )
  select exists (
    select 1
    from work_assignment assignment
    join location_ancestors ancestor on ancestor.id = assignment.location_root_id
    where assignment.workspace_id = requested_workspace_id
      and assignment.identity_id = requested_identity_id
      and assignment.operation = requested_operation
      and assignment.starts_at <= requested_at
      and assignment.expires_at > requested_at
      and assignment.revoked_at is null
  )
$$;

revoke all on function has_active_work_assignment(uuid, uuid, text, uuid, timestamptz)
from public;
grant execute on function has_active_work_assignment(uuid, uuid, text, uuid, timestamptz)
to resale_app_runtime;
grant select on work_assignment to resale_app_runtime;

comment on table work_assignment is
  'Time-bounded human assignment to one location branch and one operation. It never grants access by label alone.';

commit;
