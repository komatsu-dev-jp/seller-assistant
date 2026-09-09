begin;

create table team_assignment_change_request (
  id uuid not null default gen_random_uuid(), workspace_id uuid not null references workspace(id),
  assignment_id uuid not null,
  assignment_type text not null check (assignment_type in ('capture','location_putaway','location_photo','inventory_putaway','shipping')),
  requester_id uuid not null references app_identity(id),
  reason_code text not null check (reason_code in ('assignment_error','assignment_changed','device_lost','worker_unavailable')),
  before_snapshot jsonb not null, after_snapshot jsonb not null,
  target_version text not null check (target_version ~ '^[a-f0-9]{64}$'),
  state text not null default 'pending' check (state in ('pending','approved','rejected','changes_requested')),
  revision integer not null default 1 check (revision > 0),
  decided_by uuid references app_identity(id), decided_at timestamptz,
  idempotency_key uuid not null, payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  requested_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id,id), unique (workspace_id,idempotency_key),
  check ((state = 'pending' and decided_by is null and decided_at is null) or
    (state <> 'pending' and decided_by is not null and decided_at is not null and decided_by <> requester_id)),
  check (jsonb_typeof(before_snapshot) = 'object' and jsonb_typeof(after_snapshot) = 'object'),
  check (after_snapshot = jsonb_set(before_snapshot, '{access}', '"revoked"'::jsonb))
);
create unique index team_assignment_one_pending_change
  on team_assignment_change_request(workspace_id,assignment_type,assignment_id) where state = 'pending';

create table team_assignment_change_event (
  id uuid not null default gen_random_uuid(), workspace_id uuid not null references workspace(id),
  request_id uuid not null, revision integer not null check (revision > 0),
  actor_id uuid not null references app_identity(id),
  action text not null check (action in ('requested','approve','reject','request_changes','comment')),
  comment_code text check (comment_code in ('target_checked','dates_checked','check_target_again','check_dates_again','clarify_reason')),
  idempotency_key uuid not null, payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz not null default statement_timestamp(),
  primary key (workspace_id,id), unique (workspace_id,request_id,revision),
  unique (workspace_id,idempotency_key),
  foreign key (workspace_id,request_id) references team_assignment_change_request(workspace_id,id),
  check ((action = 'requested' and revision = 1 and comment_code is null) or
    (action <> 'requested' and revision > 1 and comment_code is not null))
);
alter table team_assignment_change_request enable row level security;
alter table team_assignment_change_request force row level security;
alter table team_assignment_change_event enable row level security;
alter table team_assignment_change_event force row level security;
create policy workspace_isolation on team_assignment_change_request using (workspace_id = app_workspace_id()) with check (workspace_id = app_workspace_id());
create policy workspace_isolation on team_assignment_change_event using (workspace_id = app_workspace_id()) with check (workspace_id = app_workspace_id());
-- Runtime callers cannot forge snapshots, update history or remove decisions.
grant select on team_assignment_change_request, team_assignment_change_event to resale_app_runtime;

-- Narrow tenant-scoped display-name access; no runtime grant on global identities.
create function app_team_change_actor_name(requested_workspace uuid, requested_identity uuid) returns text
language sql stable security definer set search_path = pg_catalog, public as $$
  select identity.display_name from public.app_identity identity
  where identity.id = requested_identity and requested_workspace = public.app_workspace_id()
    and exists (select 1 from public.workspace_membership membership
      where membership.workspace_id=requested_workspace and membership.identity_id=identity.id)
$$;
revoke all on function app_team_change_actor_name(uuid,uuid) from public;
grant execute on function app_team_change_actor_name(uuid,uuid) to resale_app_runtime;

create function app_team_change_require_manager(requested_workspace uuid, requested_actor uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if requested_workspace is distinct from public.app_workspace_id() then
    raise exception 'team change workspace forbidden' using errcode = '42501';
  end if;
  perform 1 from public.workspace_membership where workspace_id = requested_workspace
    and identity_id = requested_actor and active and role in ('owner','inventory_manager') for share;
  if not found then raise exception 'team change manager forbidden' using errcode = '42501'; end if;
end $$;

create function app_team_assignment_snapshot(requested_workspace uuid, requested_type text, requested_assignment uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare relation_name text; target_column text; operation_name text; source record; label text;
begin
  if requested_workspace is distinct from public.app_workspace_id() then
    raise exception 'team change workspace forbidden' using errcode = '42501';
  end if;
  case requested_type
    when 'capture' then relation_name := 'sku_work_assignment'; target_column := 'sku_id'; operation_name := 'capture';
    when 'location_putaway' then relation_name := 'work_assignment'; target_column := 'location_root_id'; operation_name := 'putaway';
    when 'location_photo' then relation_name := 'work_assignment'; target_column := 'location_root_id'; operation_name := 'photo';
    when 'inventory_putaway' then relation_name := 'inventory_unit_assignment'; target_column := 'inventory_unit_id'; operation_name := 'putaway';
    when 'shipping' then relation_name := 'order_assignment'; target_column := 'order_id';
    else raise exception 'unsupported team change target' using errcode = '23514';
  end case;
  execute format('select identity_id, %I as target_id, starts_at, expires_at, revoked_at from public.%I where workspace_id = $1 and id = $2%s for update',
    target_column, relation_name, case when requested_type = 'shipping' then '' else ' and operation = $3' end)
    into source using requested_workspace, requested_assignment, operation_name;
  if source is null or source.revoked_at is not null or source.starts_at > statement_timestamp() or source.expires_at <= statement_timestamp() then
    raise exception 'team change target is stale or inactive' using errcode = '23514';
  end if;
  case requested_type
    when 'capture' then select sku_code into label from public.product_sku where workspace_id = requested_workspace and id = source.target_id;
    when 'location_putaway', 'location_photo' then select code into label from public.location_node where workspace_id = requested_workspace and id = source.target_id;
    when 'inventory_putaway' then select inventory_number into label from public.inventory_unit where workspace_id = requested_workspace and id = source.target_id;
    when 'shipping' then select order_number into label from public.sales_order where workspace_id = requested_workspace and id = source.target_id;
  end case;
  if label is null then raise exception 'team change target unavailable' using errcode = '23514'; end if;
  return jsonb_build_object('assignmentId', requested_assignment, 'assignmentType', requested_type,
    'assigneeId', source.identity_id, 'targetId', source.target_id, 'targetLabel', label,
    'startsAt', to_char(source.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAt', to_char(source.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'access','active');
end $$;

create function app_request_team_assignment_change(requested_workspace uuid, requested_actor uuid,
  requested_assignment uuid, requested_type text, expected_start timestamptz, expected_expiry timestamptz,
  requested_reason text, requested_key uuid) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare source jsonb; fingerprint text; previous public.team_assignment_change_request%rowtype; new_id uuid;
begin
  perform public.app_team_change_require_manager(requested_workspace, requested_actor);
  fingerprint := encode(public.digest(jsonb_build_object('actor',requested_actor,'assignment',requested_assignment,
    'type',requested_type,'startsAt',extract(epoch from expected_start),'expiresAt',extract(epoch from expected_expiry), 'reason',requested_reason)::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtext(requested_workspace::text),hashtext(requested_key::text));
  select * into previous from public.team_assignment_change_request where workspace_id = requested_workspace and idempotency_key = requested_key;
  if found then
    if previous.payload_hash <> fingerprint then raise exception 'team change idempotency conflict' using errcode = '23514'; end if;
    return previous.id;
  end if;
  source := public.app_team_assignment_snapshot(requested_workspace,requested_type,requested_assignment);
  if (source->>'startsAt')::timestamptz <> expected_start or (source->>'expiresAt')::timestamptz <> expected_expiry then
    raise exception 'team change target version stale' using errcode = '23514';
  end if;
  insert into public.team_assignment_change_request(workspace_id,assignment_id,assignment_type,requester_id,
    reason_code,before_snapshot,after_snapshot,target_version,idempotency_key,payload_hash)
  values(requested_workspace,requested_assignment,requested_type,requested_actor,requested_reason,source,
    jsonb_set(source,'{access}','"revoked"'::jsonb),encode(public.digest(source::text,'sha256'),'hex'),requested_key,fingerprint)
  returning id into new_id;
  insert into public.team_assignment_change_event(workspace_id,request_id,revision,actor_id,action,idempotency_key,payload_hash)
  values(requested_workspace,new_id,1,requested_actor,'requested',requested_key,fingerprint);
  insert into public.audit_event(workspace_id,actor_id,action,target_type,target_id,field_names,redacted_changes,reference_ids,reason_code)
  values(requested_workspace,requested_actor,'team.change.requested','team_assignment_change_request',new_id,
    array['access'],jsonb_build_object('before',jsonb_build_object('access','active'),'after',jsonb_build_object('access','revocation_pending')),
    array[requested_assignment,new_id],requested_reason);
  return new_id;
end $$;

create function app_record_team_assignment_change_event(requested_workspace uuid, requested_actor uuid,
  requested_request uuid, expected_revision integer, requested_action text, requested_comment text, requested_key uuid) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare source public.team_assignment_change_request%rowtype; previous public.team_assignment_change_event%rowtype;
  fingerprint text; target jsonb; next_state text; next_revision integer; new_id uuid;
begin
  perform public.app_team_change_require_manager(requested_workspace,requested_actor);
  fingerprint := encode(public.digest(jsonb_build_object('actor',requested_actor,'request',requested_request,
    'revision',expected_revision,'action',requested_action,'comment',requested_comment)::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtext(requested_workspace::text),hashtext(requested_key::text));
  select * into previous from public.team_assignment_change_event where workspace_id=requested_workspace and idempotency_key=requested_key;
  if found then
    if previous.payload_hash <> fingerprint or previous.request_id <> requested_request then
      raise exception 'team change idempotency conflict' using errcode='23514';
    end if;
    return previous.id;
  end if;
  select * into source from public.team_assignment_change_request where workspace_id=requested_workspace and id=requested_request for update;
  if not found then raise exception 'team change request forbidden' using errcode='42501'; end if;
  if source.state <> 'pending' or source.revision <> expected_revision then
    raise exception 'team change decision is stale' using errcode='23514';
  end if;
  if requested_action not in ('approve','reject','request_changes','comment') then
    raise exception 'unsupported team change action' using errcode='23514';
  end if;
  if requested_action <> 'comment' and source.requester_id = requested_actor then
    raise exception 'team change self approval forbidden' using errcode='42501';
  end if;
  -- Even a rejection/return must refer to the frozen current target; emergency revocation makes it stale.
  target := public.app_team_assignment_snapshot(requested_workspace,source.assignment_type,source.assignment_id);
  if encode(public.digest(target::text,'sha256'),'hex') <> source.target_version then
    raise exception 'team change target version stale' using errcode='23514';
  end if;
  next_state := case requested_action when 'approve' then 'approved' when 'reject' then 'rejected'
    when 'request_changes' then 'changes_requested' else 'pending' end;
  next_revision := source.revision + 1;
  if requested_action = 'approve' then
    perform public.app_revoke_team_assignment(requested_workspace,requested_actor,source.assignment_type,source.assignment_id);
  end if;
  insert into public.team_assignment_change_event(workspace_id,request_id,revision,actor_id,action,comment_code,idempotency_key,payload_hash)
  values(requested_workspace,requested_request,next_revision,requested_actor,requested_action,requested_comment,requested_key,fingerprint)
  returning id into new_id;
  update public.team_assignment_change_request set revision=next_revision,state=next_state,
    decided_by=case when next_state='pending' then null else requested_actor end,
    decided_at=case when next_state='pending' then null else statement_timestamp() end
    where workspace_id=requested_workspace and id=requested_request;
  insert into public.audit_event(workspace_id,actor_id,action,target_type,target_id,field_names,redacted_changes,reference_ids,reason_code,approved_by)
  values(requested_workspace,requested_actor,'team.change.'||requested_action,'team_assignment_change_request',requested_request,
    array['state','revision','access'],jsonb_build_object('before',jsonb_build_object('state',source.state,'revision',source.revision,'access','active'),
      'after',jsonb_build_object('state',next_state,'revision',next_revision,'access',case when next_state='approved' then 'revoked' else 'active' end)),
    array[source.assignment_id,requested_request,new_id],requested_comment,case when next_state='approved' then requested_actor else null end);
  return new_id;
end $$;

revoke all on function app_team_change_require_manager(uuid,uuid) from public;
revoke all on function app_team_assignment_snapshot(uuid,text,uuid) from public;
revoke all on function app_request_team_assignment_change(uuid,uuid,uuid,text,timestamptz,timestamptz,text,uuid) from public;
revoke all on function app_record_team_assignment_change_event(uuid,uuid,uuid,integer,text,text,uuid) from public;
grant execute on function app_request_team_assignment_change(uuid,uuid,uuid,text,timestamptz,timestamptz,text,uuid) to resale_app_runtime;
grant execute on function app_record_team_assignment_change_event(uuid,uuid,uuid,integer,text,text,uuid) to resale_app_runtime;

commit;
