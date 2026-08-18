begin;

create table auth_session (
  id uuid primary key,
  identity_id uuid not null references app_identity(id),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > issued_at),
  check (revoked_at is null or revoked_at >= issued_at)
);

create index active_auth_session_by_identity
  on auth_session(identity_id, expires_at)
  where revoked_at is null;

comment on table auth_session is
  'Server-only session registry. Browser access and workspace RLS are intentionally not used before authentication.';

commit;
