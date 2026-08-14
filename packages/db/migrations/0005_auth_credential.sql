begin;

create table auth_credential (
  identity_id uuid primary key references app_identity(id),
  email_normalized text not null unique,
  password_hash bytea not null,
  password_salt bytea not null check (octet_length(password_salt) >= 16),
  hash_algorithm text not null check (hash_algorithm = 'scrypt-v1'),
  scrypt_n integer not null check (scrypt_n = 131072),
  scrypt_r integer not null check (scrypt_r = 8),
  scrypt_p integer not null check (scrypt_p = 1),
  password_changed_at timestamptz not null default now(),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  check (email_normalized = lower(btrim(email_normalized))),
  check (octet_length(password_hash) = 32)
);

create table auth_login_bucket (
  identifier_hash char(64) primary key check (identifier_hash ~ '^[a-f0-9]{64}$'),
  failed_count integer not null default 0 check (failed_count >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

comment on table auth_credential is
  'Server-only login credential. Plaintext passwords and workspace RLS access are forbidden.';
comment on table auth_login_bucket is
  'Server-only rate limit bucket keyed by an HMAC. Raw email and IP values are not stored here.';

commit;
