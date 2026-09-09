begin;

create table accounting_profile (
  workspace_id uuid primary key references workspace(id),
  business_context text not null default 'unconfigured'
    check (business_context in ('unconfigured', 'individual_business', 'company')),
  filing_context text not null default 'unconfigured'
    check (filing_context in ('unconfigured', 'blue_return', 'white_return', 'corporate_return')),
  consumption_tax_treatment text not null default 'unconfigured'
    check (consumption_tax_treatment in ('unconfigured', 'tax_exempt', 'general_taxation', 'simplified_taxation')),
  invoice_registration_status text not null default 'unconfigured'
    check (invoice_registration_status in ('unconfigured', 'not_registered', 'registered')),
  bookkeeping_method text not null default 'unconfigured'
    check (bookkeeping_method in ('unconfigured', 'single_entry', 'double_entry')),
  revision integer not null default 1 check (revision > 0),
  human_confirmed_by uuid references app_identity(id),
  human_confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((human_confirmed_by is null) = (human_confirmed_at is null))
);

create table account_mapping_rule (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  event_type text not null
    check (event_type in ('sale', 'refund', 'fee', 'fee_reversal', 'shipping', 'packaging', 'cost')),
  rule_version text not null check (char_length(rule_version) between 1 and 80),
  debit_account text not null check (char_length(debit_account) between 1 and 30),
  debit_subaccount text not null default '' check (char_length(debit_subaccount) <= 30),
  debit_tax_category text not null check (char_length(debit_tax_category) between 1 and 50),
  debit_invoice_category text not null
    check (debit_invoice_category in ('適格', '80％控除', '70％控除', '50％控除', '30％控除', '控除なし')),
  credit_account text not null check (char_length(credit_account) between 1 and 30),
  credit_subaccount text not null default '' check (char_length(credit_subaccount) <= 30),
  credit_tax_category text not null check (char_length(credit_tax_category) between 1 and 50),
  credit_invoice_category text not null
    check (credit_invoice_category in ('適格', '80％控除', '70％控除', '50％控除', '30％控除', '控除なし')),
  effective_from timestamptz not null,
  effective_until timestamptz,
  status text not null check (status in ('draft', 'active', 'retired')),
  approved_by uuid references app_identity(id),
  approved_at timestamptz,
  created_by uuid not null references app_identity(id),
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  unique (workspace_id, event_type, rule_version),
  check (effective_until is null or effective_until > effective_from),
  check (
    (status = 'active' and approved_by is not null and approved_at is not null)
    or status <> 'active'
  )
);

create table journal_candidate (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  source_event_id uuid not null,
  mapping_rule_id uuid not null,
  transaction_number text not null check (transaction_number ~ '^[0-9]{1,9}$'),
  transaction_date date not null,
  amount_jpy bigint not null check (amount_jpy > 0),
  description text not null check (char_length(description) between 1 and 200),
  evidence_reference_id uuid not null,
  financial_formula_version text not null check (financial_formula_version = 'financial_formula_v1.0.0'),
  status text not null check (status = 'approved'),
  human_approved_by uuid not null references app_identity(id),
  human_approved_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, id),
  foreign key (workspace_id, source_event_id) references financial_event(workspace_id, id),
  foreign key (workspace_id, mapping_rule_id) references account_mapping_rule(workspace_id, id)
);

create table export_batch (
  id uuid not null default gen_random_uuid(),
  workspace_id uuid not null references workspace(id),
  order_id uuid not null,
  format text not null check (format in ('money_forward_journal_v1', 'generic_journal_v1')),
  format_version text not null
    check (format_version in ('money_forward_journal_v1.0.0', 'generic_journal_v1.0.0')),
  filename text not null
    check (filename in ('money-forward-journal-v1.csv', 'generic-journal-v1.csv')),
  schema_sha256 text not null check (schema_sha256 ~ '^[a-f0-9]{64}$'),
  fixture_sha256 text not null check (fixture_sha256 ~ '^[a-f0-9]{64}$'),
  csv_sha256 text not null check (csv_sha256 ~ '^[a-f0-9]{64}$'),
  source_set_sha256 text not null check (source_set_sha256 ~ '^[a-f0-9]{64}$'),
  row_count integer not null check (row_count > 0),
  column_count integer not null check (column_count in (19, 27)),
  debit_total_jpy bigint not null check (debit_total_jpy > 0),
  credit_total_jpy bigint not null check (credit_total_jpy > 0),
  csv_content text not null,
  state text not null default 'preparing'
    check (state in ('preparing', 'ready', 'downloaded', 'import_confirmed', 'voided', 'superseded', 'failed')),
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  duplicate_override_confirmed boolean not null default false,
  supersedes_batch_id uuid,
  created_by uuid not null references app_identity(id),
  approved_by uuid not null references app_identity(id),
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  downloaded_at timestamptz,
  import_confirmed_at timestamptz,
  import_idempotency_key uuid,
  import_payload_hash text check (import_payload_hash is null or import_payload_hash ~ '^[a-f0-9]{64}$'),
  import_result text check (import_result in ('success', 'failed')),
  imported_row_count integer check (imported_row_count >= 0),
  import_note text check (import_note is null or char_length(import_note) <= 500),
  terminal_at timestamptz,
  primary key (workspace_id, id),
  unique (workspace_id, idempotency_key),
  unique (workspace_id, import_idempotency_key),
  foreign key (workspace_id, order_id) references sales_order(workspace_id, id),
  foreign key (workspace_id, supersedes_batch_id) references export_batch(workspace_id, id),
  check (debit_total_jpy = credit_total_jpy),
  check (
    (format = 'money_forward_journal_v1' and format_version = 'money_forward_journal_v1.0.0'
      and filename = 'money-forward-journal-v1.csv' and column_count = 27)
    or
    (format = 'generic_journal_v1' and format_version = 'generic_journal_v1.0.0'
      and filename = 'generic-journal-v1.csv' and column_count = 19)
  ),
  check ((import_idempotency_key is null) = (import_payload_hash is null)),
  check (
    (supersedes_batch_id is null and not duplicate_override_confirmed)
    or (supersedes_batch_id is not null and duplicate_override_confirmed)
  )
);

create table export_batch_source (
  workspace_id uuid not null references workspace(id),
  export_batch_id uuid not null,
  journal_candidate_id uuid not null,
  source_event_id uuid not null,
  ordinal integer not null check (ordinal > 0),
  primary key (workspace_id, export_batch_id, ordinal),
  unique (workspace_id, export_batch_id, source_event_id),
  foreign key (workspace_id, export_batch_id) references export_batch(workspace_id, id),
  foreign key (workspace_id, journal_candidate_id) references journal_candidate(workspace_id, id),
  foreign key (workspace_id, source_event_id) references financial_event(workspace_id, id)
);

create or replace function validate_active_account_mapping_rule() returns trigger
language plpgsql as $$
begin
  if new.status = 'active' and exists (
    select 1 from account_mapping_rule existing
    where existing.workspace_id = new.workspace_id
      and existing.event_type = new.event_type
      and existing.status = 'active'
      and existing.id <> new.id
      and tstzrange(existing.effective_from, existing.effective_until, '[)')
          && tstzrange(new.effective_from, new.effective_until, '[)')
  ) then
    raise exception 'an active mapping rule already covers this event and period';
  end if;
  return new;
end $$;

create trigger active_account_mapping_rule_guard
before insert or update on account_mapping_rule
for each row execute function validate_active_account_mapping_rule();

create or replace function prevent_journal_candidate_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'approved journal candidates are immutable';
end $$;

create trigger journal_candidate_immutable
before update or delete on journal_candidate
for each row execute function prevent_journal_candidate_mutation();

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
        or mapping.status <> 'active'
        or mapping.approved_by is null
        or event.event_type <> mapping.event_type
        or event.occurred_at < mapping.effective_from
        or (mapping.effective_until is not null and event.occurred_at >= mapping.effective_until)
      );
    if invalid_source_count <> 0 then
      raise exception 'export contains an unapproved or expired mapping';
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

create trigger export_batch_transition_guard
before update on export_batch
for each row execute function validate_export_batch_transition();

create or replace function prevent_export_batch_source_mutation() returns trigger
language plpgsql as $$
declare batch_state text;
begin
  select state into batch_state from export_batch
  where workspace_id = coalesce(new.workspace_id, old.workspace_id)
    and id = coalesce(new.export_batch_id, old.export_batch_id);
  if tg_op <> 'INSERT' or batch_state <> 'preparing' then
    raise exception 'export batch sources are immutable after preparation';
  end if;
  return new;
end $$;

create trigger export_batch_source_immutable
before insert or update or delete on export_batch_source
for each row execute function prevent_export_batch_source_mutation();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'accounting_profile', 'account_mapping_rule', 'journal_candidate',
    'export_batch', 'export_batch_source'
  ] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('alter table %I force row level security', table_name);
    execute format(
      'create policy workspace_isolation on %I using (workspace_id = app_workspace_id()) with check (workspace_id = app_workspace_id())',
      table_name
    );
  end loop;
end $$;

grant select, insert, update on accounting_profile, account_mapping_rule, export_batch
  to resale_app_runtime;
grant select, insert on journal_candidate, export_batch_source to resale_app_runtime;

comment on table accounting_profile is
  'Human-confirmed workspace accounting assumptions. Every field starts unconfigured and AI never fills it.';
comment on table export_batch is
  'Immutable versioned CSV export bytes and manual download/import-confirmation history. No external API delivery.';

commit;
