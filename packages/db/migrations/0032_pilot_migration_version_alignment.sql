begin;

-- Keep every historical pilot environment readable while allowing a new run to
-- record the schema version that is actually installed. This widens only the
-- accepted values; existing immutable pilot rows are never rewritten.
alter table pilot_run drop constraint pilot_run_migration_version_check;
alter table pilot_run add constraint pilot_run_migration_version_check
  check (migration_version in (
    '0023', '0024', '0025', '0026', '0027', '0028', '0029', '0030', '0031', '0032'
  ));

comment on constraint pilot_run_migration_version_check on pilot_run is
  'Accepts append-only pilot schema versions; historical run environment values remain immutable.';

commit;
