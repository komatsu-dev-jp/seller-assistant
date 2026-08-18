begin;

create or replace function login_default_workspace(p_identity_id uuid) returns uuid
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select membership.workspace_id
  from public.workspace_membership membership
  where membership.identity_id = p_identity_id and membership.active
  order by case membership.role when 'owner' then 0 else 1 end, membership.workspace_id
  limit 1
$$;

revoke all on function login_default_workspace(uuid) from public;
grant execute on function login_default_workspace(uuid) to resale_app_runtime;

alter table auth_session add column workspace_id uuid;

update auth_session session
set workspace_id = login_default_workspace(session.identity_id)
where session.workspace_id is null;

delete from auth_session where workspace_id is null;

alter table auth_session
  alter column workspace_id set not null,
  add constraint auth_session_workspace_fk foreign key (workspace_id) references workspace(id);

create index active_auth_session_by_workspace
  on auth_session(workspace_id, identity_id, expires_at)
  where revoked_at is null;

comment on function login_default_workspace(uuid) is
  'Returns one active workspace only for a successfully verified server-side credential.';

commit;
