begin;

create table count_session_post_start_movement (
  workspace_id uuid not null references workspace(id),
  count_session_id uuid not null,
  inventory_unit_id uuid not null,
  snapshot_movement_seq bigint not null,
  current_movement_seq bigint not null,
  expected_location_id uuid not null,
  current_location_id uuid,
  detected_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id, count_session_id, inventory_unit_id),
  foreign key (workspace_id, count_session_id)
    references count_session(workspace_id, id),
  foreign key (workspace_id, inventory_unit_id)
    references inventory_unit(workspace_id, id),
  foreign key (workspace_id, expected_location_id)
    references location_node(workspace_id, id),
  foreign key (workspace_id, current_location_id)
    references location_node(workspace_id, id),
  check (snapshot_movement_seq >= 0),
  check (current_movement_seq > snapshot_movement_seq)
);

alter table count_session_post_start_movement enable row level security;
alter table count_session_post_start_movement force row level security;
create policy workspace_isolation on count_session_post_start_movement
using (workspace_id = app_workspace_id())
with check (workspace_id = app_workspace_id());

grant select, insert on count_session_post_start_movement to resale_app_runtime;

comment on table count_session_post_start_movement is
  'Normal inventory movements after stocktake start. These units are shown separately and never treated as missing candidates.';

commit;
