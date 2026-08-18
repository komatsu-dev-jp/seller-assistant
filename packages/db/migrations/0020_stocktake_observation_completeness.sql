begin;

alter table count_observation
  add column observed_code text,
  add column read_failure_reason text;

update count_observation observation
set observed_code = unit.inventory_number
from inventory_unit unit
where unit.workspace_id = observation.workspace_id
  and unit.id = observation.inventory_unit_id
  and observation.observed_code is null;

alter table count_observation
  add constraint count_observation_unreadable_contract check (
    (result = 'unreadable' and inventory_unit_id is null and observed_code is null
      and read_failure_reason in ('camera_blur','damaged_label','no_label','manual_unreadable'))
    or
    (result <> 'unreadable' and read_failure_reason is null)
  );

comment on column count_observation.observed_code is
  'The checked inventory code that a human scanned. It is retained for unexpected and duplicate evidence.';
comment on column count_observation.read_failure_reason is
  'Fixed allowlist reason only; no photo, OCR body or free text.';

commit;
