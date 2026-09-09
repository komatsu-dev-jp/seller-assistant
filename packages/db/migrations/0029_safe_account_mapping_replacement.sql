begin;

alter table account_mapping_rule
  add column replaces_rule_id uuid,
  add column change_reason_code text,
  add constraint account_mapping_rule_replacement_reference
    foreign key (workspace_id, replaces_rule_id)
    references account_mapping_rule(workspace_id, id)
    deferrable initially deferred,
  add constraint account_mapping_rule_change_reason_check check (
    (replaces_rule_id is null and change_reason_code is null)
    or (
      replaces_rule_id is not null
      and change_reason_code in (
        'account_review',
        'tax_review',
        'bookkeeping_policy_update',
        'correction',
        'other_reviewed_change'
      )
    )
  );

create unique index one_account_mapping_replacement_per_rule
on account_mapping_rule(workspace_id, replaces_rule_id)
where replaces_rule_id is not null;

create or replace function app_identity_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.identity_id', true), '')::uuid
$$;

create or replace function validate_active_account_mapping_rule() returns trigger
language plpgsql as $$
begin
  if new.status in ('active', 'retired') and exists (
    select 1 from account_mapping_rule existing
    where existing.workspace_id = new.workspace_id
      and existing.event_type = new.event_type
      and existing.status in ('active', 'retired')
      and existing.id <> new.id
      and tstzrange(existing.effective_from, existing.effective_until, '[)')
          && tstzrange(new.effective_from, new.effective_until, '[)')
  ) then
    raise exception 'an approved mapping rule already covers this event and period';
  end if;
  return new;
end $$;

create or replace function guard_account_mapping_rule_versioning() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'account mapping rules are append-only';
  end if;

  if new.workspace_id is distinct from old.workspace_id
    or new.event_type is distinct from old.event_type
    or new.rule_version is distinct from old.rule_version
    or new.debit_account is distinct from old.debit_account
    or new.debit_subaccount is distinct from old.debit_subaccount
    or new.debit_tax_category is distinct from old.debit_tax_category
    or new.debit_invoice_category is distinct from old.debit_invoice_category
    or new.credit_account is distinct from old.credit_account
    or new.credit_subaccount is distinct from old.credit_subaccount
    or new.credit_tax_category is distinct from old.credit_tax_category
    or new.credit_invoice_category is distinct from old.credit_invoice_category
    or new.effective_from is distinct from old.effective_from
    or new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
    or new.replaces_rule_id is distinct from old.replaces_rule_id
    or new.change_reason_code is distinct from old.change_reason_code then
    raise exception 'account mapping accounting fields are immutable; create a replacement version';
  end if;

  if old.status <> 'active'
    or old.effective_until is not null
    or new.status <> 'retired'
    or new.effective_until is null
    or new.effective_until <= old.effective_from then
    raise exception 'an active account mapping may only be retired at a later effective boundary';
  end if;
  return new;
end $$;

create trigger account_mapping_rule_version_guard
before update or delete on account_mapping_rule
for each row execute function guard_account_mapping_rule_versioning();

create or replace function validate_account_mapping_replacement() returns trigger
language plpgsql as $$
declare
  replaced account_mapping_rule%rowtype;
begin
  if app_identity_id() is null
    or new.created_by <> app_identity_id()
    or new.approved_by is distinct from app_identity_id()
    or not exists (
      select 1 from workspace_membership membership
      where membership.workspace_id = new.workspace_id
        and membership.identity_id = app_identity_id()
        and membership.active
        and membership.role in ('owner', 'accounting')
    ) then
    raise exception 'the mapping approver must be the active accounting actor';
  end if;

  if new.replaces_rule_id is null then
    if new.status <> 'active'
      or new.effective_until is not null
      or new.approved_by is distinct from app_identity_id()
      or new.approved_at is null then
      raise exception 'an initial approved mapping must be active, open-ended, and approved by the session actor';
    end if;
    return new;
  end if;

  select * into replaced
  from account_mapping_rule
  where workspace_id = new.workspace_id and id = new.replaces_rule_id
  for key share;

  if replaced.id is null
    or replaced.workspace_id <> new.workspace_id
    or replaced.event_type <> new.event_type
    or replaced.status <> 'retired'
    or replaced.effective_until is distinct from new.effective_from
    or new.status <> 'active'
    or new.effective_until is not null
    or new.approved_by is null
    or new.approved_at is null
    or new.rule_version = replaced.rule_version then
    raise exception 'the replacement mapping does not match the retired rule boundary';
  end if;
  return new;
end $$;

create trigger account_mapping_replacement_guard
before insert on account_mapping_rule
for each row execute function validate_account_mapping_replacement();

create or replace function ensure_retired_account_mapping_rule_has_replacement() returns trigger
language plpgsql as $$
begin
  if exists (
    select 1
    from journal_candidate candidate
    join financial_event event
      on event.workspace_id = candidate.workspace_id
      and event.id = candidate.source_event_id
    where candidate.workspace_id = new.workspace_id
      and candidate.mapping_rule_id = new.id
      and event.occurred_at >= new.effective_until
  ) then
    raise exception 'the retirement boundary must be after every existing journal candidate event';
  end if;

  if not exists (
    select 1 from account_mapping_rule replacement
    where replacement.workspace_id = new.workspace_id
      and replacement.replaces_rule_id = new.id
      and replacement.event_type = new.event_type
      and replacement.status = 'active'
      and replacement.effective_from = new.effective_until
      and replacement.effective_until is null
  ) then
    raise exception 'retiring an account mapping requires an atomic active replacement';
  end if;
  return null;
end $$;

create constraint trigger retired_account_mapping_rule_requires_replacement
after update on account_mapping_rule
deferrable initially deferred
for each row
when (new.status = 'retired')
execute function ensure_retired_account_mapping_rule_has_replacement();

create or replace function validate_export_batch_transition() returns trigger
language plpgsql as $$
declare
  profile_ready boolean;
  source_count integer;
  invalid_source_count integer;
  prior_batch_id uuid;
begin
  if old.state = new.state then
    if row(old.*) is distinct from row(new.*) then
      raise exception 'export batch content is immutable';
    end if;
    return new;
  end if;
  if not (
    (old.state = 'preparing' and new.state in ('ready', 'failed'))
    or (old.state = 'ready' and new.state in ('downloaded', 'voided', 'superseded'))
    or (old.state = 'downloaded' and new.state in ('import_confirmed', 'voided', 'superseded'))
    or (old.state = 'import_confirmed' and new.state = 'superseded')
  ) then
    raise exception 'export batch transition is not allowed';
  end if;

  if new.state = 'ready' then
    select (
      profile.business_context <> 'unconfigured'
      and profile.filing_context <> 'unconfigured'
      and profile.consumption_tax_treatment <> 'unconfigured'
      and profile.invoice_registration_status <> 'unconfigured'
      and profile.bookkeeping_method <> 'unconfigured'
      and profile.human_confirmed_by is not null
    ) into profile_ready
    from accounting_profile profile where profile.workspace_id = new.workspace_id;
    if coalesce(profile_ready, false) is false then
      raise exception 'a human-confirmed accounting profile is required';
    end if;

    select count(*)::integer into source_count from export_batch_source source
    where source.workspace_id = new.workspace_id and source.export_batch_id = new.id;
    if source_count <> new.row_count then
      raise exception 'export source count does not match row count';
    end if;

    select count(*)::integer into invalid_source_count
    from export_batch_source source
    join journal_candidate candidate
      on candidate.workspace_id = source.workspace_id and candidate.id = source.journal_candidate_id
    join account_mapping_rule mapping
      on mapping.workspace_id = candidate.workspace_id and mapping.id = candidate.mapping_rule_id
    join financial_event event
      on event.workspace_id = source.workspace_id and event.id = source.source_event_id
    where source.workspace_id = new.workspace_id and source.export_batch_id = new.id
      and (
        candidate.source_event_id <> source.source_event_id
        or candidate.status <> 'approved'
        or mapping.status not in ('active', 'retired')
        or mapping.approved_by is null
        or mapping.approved_at is null
        or event.event_type <> mapping.event_type
        or event.occurred_at < mapping.effective_from
        or (mapping.effective_until is not null and event.occurred_at >= mapping.effective_until)
        or (mapping.status = 'retired' and mapping.effective_until is null)
      );
    if invalid_source_count <> 0 then
      raise exception 'export contains an unapproved or out-of-period mapping';
    end if;

    select prior.id into prior_batch_id
    from export_batch prior
    where prior.workspace_id = new.workspace_id
      and prior.id <> new.id
      and prior.source_set_sha256 = new.source_set_sha256
      and prior.state not in ('voided', 'failed')
    order by prior.created_at desc limit 1;
    if prior_batch_id is not null and (
      not new.duplicate_override_confirmed
      or new.supersedes_batch_id is distinct from prior_batch_id
    ) then
      raise exception 'a prior export with the same source set requires explicit supersession';
    end if;
    if prior_batch_id is null and new.supersedes_batch_id is not null then
      raise exception 'supersedes batch does not match a prior duplicate source set';
    end if;
    new.ready_at := statement_timestamp();
  elsif new.state = 'downloaded' then
    new.downloaded_at := statement_timestamp();
  elsif new.state = 'import_confirmed' then
    if new.import_result is null or new.imported_row_count is null then
      raise exception 'import confirmation requires a result and row count';
    end if;
    new.import_confirmed_at := statement_timestamp();
  elsif new.state in ('voided', 'superseded', 'failed') then
    new.terminal_at := statement_timestamp();
  end if;

  if old.workspace_id <> new.workspace_id
    or old.order_id <> new.order_id
    or old.format <> new.format
    or old.format_version <> new.format_version
    or old.filename <> new.filename
    or old.schema_sha256 <> new.schema_sha256
    or old.fixture_sha256 <> new.fixture_sha256
    or old.csv_sha256 <> new.csv_sha256
    or old.source_set_sha256 <> new.source_set_sha256
    or old.row_count <> new.row_count
    or old.column_count <> new.column_count
    or old.debit_total_jpy <> new.debit_total_jpy
    or old.credit_total_jpy <> new.credit_total_jpy
    or old.csv_content <> new.csv_content
    or old.idempotency_key <> new.idempotency_key
    or old.payload_hash <> new.payload_hash
    or old.duplicate_override_confirmed <> new.duplicate_override_confirmed
    or old.supersedes_batch_id is distinct from new.supersedes_batch_id
    or old.created_by <> new.created_by
    or old.approved_by <> new.approved_by
    or old.created_at <> new.created_at then
    raise exception 'export batch immutable fields cannot change';
  end if;
  return new;
end $$;

comment on column account_mapping_rule.replaces_rule_id is
  'Prior approved rule retired atomically when this human-confirmed version was appended.';
comment on column account_mapping_rule.change_reason_code is
  'Stable non-sensitive reason category. Free-form accounting or tax text is never stored here.';

commit;
