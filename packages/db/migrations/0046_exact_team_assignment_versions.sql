begin;

-- A digest of the complete raw assignment, with exact microsecond epochs independent of display/time zone.
-- No database access or authority is granted by this deterministic digest helper.
create function app_team_assignment_exact_version(requested_type text, source jsonb) returns text
language plpgsql immutable set search_path=pg_catalog,public as $$
declare normalized jsonb;
begin
  if requested_type is null or source is null then
    raise exception 'required version argument missing' using errcode='23514';
  end if;
  if jsonb_typeof(source) is distinct from 'object' or source->>'id' is null or source->>'workspace_id' is null
    or source->>'identity_id' is null or source->>'starts_at' is null or source->>'expires_at' is null or source->>'created_at' is null then
    raise exception 'invalid version source' using errcode='23514';
  end if;
  normalized := (source - array['starts_at','expires_at','revoked_at','created_at']) || jsonb_build_object(
    'starts_at',extract(epoch from (source->>'starts_at')::timestamptz),
    'expires_at',extract(epoch from (source->>'expires_at')::timestamptz),
    'revoked_at',extract(epoch from (source->>'revoked_at')::timestamptz),
    'created_at',extract(epoch from (source->>'created_at')::timestamptz));
  return encode(public.digest(jsonb_build_object('assignmentType',requested_type,'raw',normalized)::text,'sha256'),'hex');
end $$;
revoke all on function app_team_assignment_exact_version(text,jsonb) from public;
grant execute on function app_team_assignment_exact_version(text,jsonb) to resale_app_runtime;

create or replace function app_team_change_require_manager(requested_workspace uuid, requested_actor uuid) returns void
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if requested_workspace is null or requested_actor is null then raise exception 'required manager argument missing' using errcode='23514'; end if;
  if requested_workspace is distinct from public.app_workspace_id() then
    raise exception 'team change workspace forbidden' using errcode = '42501';
  end if;
  perform 1 from public.workspace_membership where workspace_id = requested_workspace
    and identity_id = requested_actor and active and role in ('owner','inventory_manager') for share;
  if not found then raise exception 'team change manager forbidden' using errcode = '42501'; end if;
end $$;

create function app_team_assignment_locked_context(requested_workspace uuid, requested_type text, requested_assignment uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public as $$
declare relation_name text; target_column text; operation_name text; source record; label text; checked_at timestamptz;
begin
  if requested_workspace is null or requested_type is null or requested_assignment is null then raise exception 'required assignment argument missing' using errcode='23514'; end if;
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
  execute format('select identity_id, %I as target_id, starts_at, expires_at, revoked_at, to_jsonb(assignment) as raw_assignment from public.%I assignment where workspace_id = $1 and id = $2%s for update',
    target_column, relation_name, case when requested_type = 'shipping' then '' else ' and operation = $3' end)
    into source using requested_workspace, requested_assignment, operation_name;
  checked_at := clock_timestamp();
  if source is null or source.revoked_at is not null or source.starts_at > checked_at or source.expires_at <= checked_at then
    raise exception 'team change target is stale or inactive' using errcode = '23514';
  end if;
  case requested_type
    when 'capture' then select sku_code into label from public.product_sku where workspace_id = requested_workspace and id = source.target_id;
    when 'location_putaway', 'location_photo' then select code into label from public.location_node where workspace_id = requested_workspace and id = source.target_id;
    when 'inventory_putaway' then select inventory_number into label from public.inventory_unit where workspace_id = requested_workspace and id = source.target_id;
    when 'shipping' then select order_number into label from public.sales_order where workspace_id = requested_workspace and id = source.target_id;
  end case;
  if label is null then raise exception 'team change target unavailable' using errcode = '23514'; end if;
  return jsonb_build_object('version',public.app_team_assignment_exact_version(requested_type,source.raw_assignment),
    'snapshot',jsonb_build_object('assignmentId', requested_assignment, 'assignmentType', requested_type,
    'assigneeId', source.identity_id, 'targetId', source.target_id, 'targetLabel', label,
    'startsAt', to_char(source.starts_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAt', to_char(source.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'access','active'));
end $$;

create function app_request_team_assignment_change(requested_workspace uuid, requested_actor uuid,
  requested_assignment uuid, requested_type text, expected_version text,
  requested_reason text, requested_key uuid) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare context jsonb; source jsonb; fingerprint text; previous public.team_assignment_change_request%rowtype; new_id uuid;
begin
  if requested_workspace is null or requested_actor is null or requested_assignment is null or requested_type is null
    or expected_version is null or requested_reason is null or requested_key is null then
    raise exception 'required request argument missing' using errcode='23514'; end if;
  if expected_version !~ '^[a-f0-9]{64}$' then raise exception 'invalid assignment version' using errcode='23514'; end if;
  perform public.app_team_change_require_manager(requested_workspace, requested_actor);
  fingerprint := encode(public.digest(jsonb_build_object('actor',requested_actor,'assignment',requested_assignment,
    'type',requested_type,'version',expected_version,'reason',requested_reason)::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtext(requested_workspace::text),hashtext(requested_key::text));
  select * into previous from public.team_assignment_change_request where workspace_id = requested_workspace and idempotency_key = requested_key;
  if found then
    if previous.payload_hash is distinct from fingerprint then raise exception 'team change idempotency conflict' using errcode = '23514'; end if;
    return previous.id;
  end if;
  context := public.app_team_assignment_locked_context(requested_workspace,requested_type,requested_assignment);
  source := context->'snapshot';
  if context->>'version' is distinct from expected_version then
    raise exception 'team change target version stale' using errcode = '23514';
  end if;
  insert into public.team_assignment_change_request(workspace_id,assignment_id,assignment_type,requester_id,
    reason_code,before_snapshot,after_snapshot,target_version,idempotency_key,payload_hash)
  values(requested_workspace,requested_assignment,requested_type,requested_actor,requested_reason,source,
    jsonb_set(source,'{access}','"revoked"'::jsonb),context->>'version',requested_key,fingerprint)
  returning id into new_id;
  insert into public.team_assignment_change_event(workspace_id,request_id,revision,actor_id,action,idempotency_key,payload_hash)
  values(requested_workspace,new_id,1,requested_actor,'requested',requested_key,fingerprint);
  insert into public.audit_event(workspace_id,actor_id,action,target_type,target_id,field_names,redacted_changes,reference_ids,reason_code)
  values(requested_workspace,requested_actor,'team.change.requested','team_assignment_change_request',new_id,
    array['access'],jsonb_build_object('before',jsonb_build_object('access','active'),'after',jsonb_build_object('access','revocation_pending')),
    array[requested_assignment,new_id],requested_reason);
  return new_id;
end $$;

create or replace function app_record_team_assignment_change_event(requested_workspace uuid, requested_actor uuid,
  requested_request uuid, expected_revision integer, requested_action text, requested_comment text, requested_key uuid) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare source public.team_assignment_change_request%rowtype; previous public.team_assignment_change_event%rowtype;
  fingerprint text; target jsonb; next_state text; next_revision integer; new_id uuid;
begin
  if requested_workspace is null or requested_actor is null or requested_request is null or expected_revision is null
    or requested_action is null or requested_comment is null or requested_key is null then
    raise exception 'required decision argument missing' using errcode='23514'; end if;
  if expected_revision < 1 or requested_comment not in ('target_checked','dates_checked','check_target_again','check_dates_again','clarify_reason') then
    raise exception 'invalid decision revision or comment' using errcode='23514'; end if;
  perform public.app_team_change_require_manager(requested_workspace,requested_actor);
  fingerprint := encode(public.digest(jsonb_build_object('actor',requested_actor,'request',requested_request,
    'revision',expected_revision,'action',requested_action,'comment',requested_comment)::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtext(requested_workspace::text),hashtext(requested_key::text));
  select * into previous from public.team_assignment_change_event where workspace_id=requested_workspace and idempotency_key=requested_key;
  if found then
    if previous.payload_hash is distinct from fingerprint or previous.request_id is distinct from requested_request then
      raise exception 'team change idempotency conflict' using errcode='23514';
    end if;
    return previous.id;
  end if;
  select * into source from public.team_assignment_change_request where workspace_id=requested_workspace and id=requested_request for update;
  if not found then raise exception 'team change request forbidden' using errcode='42501'; end if;
  if source.state is distinct from 'pending' or source.revision is distinct from expected_revision then
    raise exception 'team change decision is stale' using errcode='23514';
  end if;
  if requested_action not in ('approve','reject','request_changes','comment') then
    raise exception 'unsupported team change action' using errcode='23514';
  end if;
  if requested_action <> 'comment' and source.requester_id is not distinct from requested_actor then
    raise exception 'team change self approval forbidden' using errcode='42501';
  end if;
  -- Even a rejection/return must refer to the frozen current target; emergency revocation makes it stale.
  target := public.app_team_assignment_locked_context(requested_workspace,source.assignment_type,source.assignment_id);
  if target->>'version' is distinct from source.target_version then
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

-- The old display-time signature must no longer be callable by the application.
revoke all on function app_request_team_assignment_change(uuid,uuid,uuid,text,timestamptz,timestamptz,text,uuid) from public,resale_app_runtime;
revoke all on function app_team_assignment_locked_context(uuid,text,uuid) from public,resale_app_runtime;
revoke all on function app_request_team_assignment_change(uuid,uuid,uuid,text,text,text,uuid) from public;
grant execute on function app_request_team_assignment_change(uuid,uuid,uuid,text,text,text,uuid) to resale_app_runtime;
revoke all on function app_record_team_assignment_change_event(uuid,uuid,uuid,integer,text,text,uuid) from public;
grant execute on function app_record_team_assignment_change_event(uuid,uuid,uuid,integer,text,text,uuid) to resale_app_runtime;
commit;
