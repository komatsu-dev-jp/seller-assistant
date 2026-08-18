begin;

create table count_session_inventory_snapshot (
  workspace_id uuid not null references workspace(id),
  count_session_id uuid not null,
  inventory_unit_id uuid not null,
  expected_location_id uuid not null,
  inventory_number text not null,
  inventory_label_id uuid,
  inventory_status text not null,
  movement_seq bigint not null,
  captured_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, count_session_id, inventory_unit_id),
  foreign key (workspace_id, count_session_id)
    references count_session(workspace_id, id),
  foreign key (workspace_id, inventory_unit_id)
    references inventory_unit(workspace_id, id),
  foreign key (workspace_id, expected_location_id)
    references location_node(workspace_id, id),
  foreign key (inventory_label_id) references inventory_label(id),
  check (inventory_status in ('available','reserved','picked','packed')),
  check (movement_seq >= 0)
);

alter table count_session_inventory_snapshot enable row level security;
alter table count_session_inventory_snapshot force row level security;
create policy workspace_isolation on count_session_inventory_snapshot
using (workspace_id = app_workspace_id())
with check (workspace_id = app_workspace_id());

grant select, insert on count_session_inventory_snapshot to resale_app_runtime;

comment on table count_session_inventory_snapshot is
  'Immutable expected inventory captured when a stocktake starts. Reconciliation never rebuilds this list from current locations.';

commit;
