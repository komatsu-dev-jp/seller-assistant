begin;

alter table audit_event
  add column reason_code text not null default 'operation_recorded'
    check (reason_code ~ '^[a-z][a-z0-9_]{2,63}$'),
  add column approved_by uuid references app_identity(id);

create index audit_event_approver_lookup
on audit_event(workspace_id, approved_by, occurred_at desc)
where approved_by is not null;

comment on column audit_event.reason_code is
  'Stable non-sensitive reason category; never store free-form addresses, tokens, receipt bodies or AI text.';
comment on column audit_event.approved_by is
  'Human approver for a confirmation gate; null means the event was observed or submitted, not approved.';

commit;
