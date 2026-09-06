do $$
begin
  if not exists (
    select 1 from pgmq.list_queues() where queue_name = 'account_cleanup'
  ) then
    perform pgmq.create('account_cleanup');
  end if;

  if not exists (
    select 1 from pgmq.list_queues() where queue_name = 'object_cleanup'
  ) then
    perform pgmq.create('object_cleanup');
  end if;
end
$$;

revoke all privileges on all tables in schema pgmq from anon, authenticated;
revoke all privileges on all sequences in schema pgmq from anon, authenticated;

create or replace function spectra_private.enqueue_object_cleanup()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pgmq
as $$
begin
  if new.lifecycle = 'deletion_pending'
    and (
      old.lifecycle is distinct from new.lifecycle
      or old.cleanup_queued_at is null
    )
  then
    perform pgmq.send(
      'object_cleanup',
      jsonb_build_object(
        'object_ref', new.object_ref,
        'object_key', new.object_key,
        'owner_user_id', new.owner_user_id
      )
    );
    new.cleanup_queued_at := coalesce(new.cleanup_queued_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists object_records_enqueue_cleanup on public.object_records;
create trigger object_records_enqueue_cleanup
before update on public.object_records
for each row execute function spectra_private.enqueue_object_cleanup();

create or replace function spectra_private.read_maintenance_queue(
  p_queue_name text,
  p_visibility_timeout integer default 300,
  p_quantity integer default 25
)
returns setof pgmq.message_record
language plpgsql
security definer
set search_path = pg_catalog, pgmq
as $$
begin
  if p_queue_name not in ('account_cleanup', 'object_cleanup')
    or p_visibility_timeout not between 30 and 3600
    or p_quantity not between 1 and 100
  then
    raise exception using errcode = '22023', message = 'invalid maintenance queue read';
  end if;

  return query
    select *
    from pgmq.read(p_queue_name, p_visibility_timeout, p_quantity);
end;
$$;

create or replace function spectra_private.delete_maintenance_message(
  p_queue_name text,
  p_message_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pgmq
as $$
begin
  if p_queue_name not in ('account_cleanup', 'object_cleanup')
    or p_message_id <= 0
  then
    raise exception using errcode = '22023', message = 'invalid maintenance queue delete';
  end if;

  return pgmq.delete(p_queue_name, p_message_id);
end;
$$;

create or replace function spectra_private.maintenance_queue_metrics()
returns setof pgmq.metrics_result
language sql
stable
security definer
set search_path = pg_catalog, pgmq
as $$
  select metrics.*
  from pgmq.metrics_all() metrics
  where metrics.queue_name in ('account_cleanup', 'object_cleanup')
$$;

create or replace function spectra_private.run_retention_maintenance(
  p_batch_size integer default 10000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
  v_result jsonb := '{}'::jsonb;
begin
  if p_batch_size not between 1 and 50000 then
    raise exception using errcode = '22023', message = 'invalid retention batch size';
  end if;

  with victims as (
    select ctid
    from public.sealed_relay_messages
    where expires_at <= now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.sealed_relay_messages rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('sealed_relay_messages', v_count);

  with victims as (
    select ctid
    from public.auth_wallet_challenges
    where expires_at <= now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.auth_wallet_challenges rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('auth_wallet_challenges', v_count);

  with victims as (
    select ctid
    from public.auth_refresh_tokens
    where expires_at < now() - interval '24 hours'
       or revoked_at < now() - interval '24 hours'
       or rotated_at < now() - interval '24 hours'
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.auth_refresh_tokens rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('auth_refresh_tokens', v_count);

  with victims as (
    select ctid
    from public.api_rate_limits
    where expires_at <= now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.api_rate_limits rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('api_rate_limits', v_count);

  with victims as (
    select ctid
    from public.push_notification_dispatches
    where created_at < now() - interval '7 days'
    order by created_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.push_notification_dispatches rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('push_dispatches', v_count);

  with victims as (
    select ctid
    from public.mobile_spectre_addresses
    where expires_at <= now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.mobile_spectre_addresses rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('spectre_addresses', v_count);

  with victims as (
    select ctid
    from public.wallet_transfer_notifications
    where (read_at is not null and read_at < now() - interval '90 days')
       or created_at < now() - interval '1 year'
    order by created_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.wallet_transfer_notifications rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('wallet_notifications', v_count);

  with victims as (
    select chain, cursor_name
    from public.wallet_index_cursors
    where lock_expires_at <= now()
    order by lock_expires_at
    limit p_batch_size
    for update skip locked
  )
  update public.wallet_index_cursors rows
  set run_id = null,
      locked_at = null,
      lock_expires_at = null,
      updated_at = now()
  from victims
  where rows.chain = victims.chain
    and rows.cursor_name = victims.cursor_name;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('wallet_cursor_locks', v_count);

  with victims as (
    select transition_id
    from public.group_epoch_transitions
    where status = 'pending' and expires_at <= now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  update public.group_epoch_transitions rows
  set status = 'cancelled'
  from victims
  where rows.transition_id = victims.transition_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('group_transitions_cancelled', v_count);

  with victims as (
    select transition_id
    from public.group_epoch_transitions
    where status in ('activated', 'cancelled')
      and created_at < now() - interval '90 days'
    order by created_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.group_epoch_transitions rows
  using victims
  where rows.transition_id = victims.transition_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('group_transitions', v_count);

  with victims as (
    select id
    from public.mobile_spectre_backup_manifests
    where status in ('pending', 'active')
      and expires_at is not null
      and expires_at <= now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  update public.mobile_spectre_backup_manifests rows
  set status = 'expired',
      deleted_at = coalesce(rows.deleted_at, now()),
      delete_reason = 'expired'
  from victims
  where rows.id = victims.id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('backup_manifests', v_count);

  with victims as (
    select objects.object_ref
    from public.object_records objects
    join public.mobile_spectre_backup_manifests manifests
      on manifests.object_ref = objects.object_ref
    where manifests.status = 'expired'
      and objects.lifecycle in ('pending', 'active', 'expired')
    order by manifests.expires_at
    limit p_batch_size
    for update of objects skip locked
  )
  update public.object_records rows
  set lifecycle = 'deletion_pending',
      deleted_at = coalesce(rows.deleted_at, now())
  from victims
  where rows.object_ref = victims.object_ref;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('backup_objects_queued', v_count);

  with victims as (
    select object_ref
    from public.object_records
    where lifecycle in ('pending', 'active', 'expired')
      and (
        retention_expires_at <= now()
        or (lifecycle = 'pending' and created_at < now() - interval '1 hour')
      )
    order by coalesce(retention_expires_at, created_at)
    limit p_batch_size
    for update skip locked
  )
  update public.object_records rows
  set lifecycle = 'deletion_pending',
      deleted_at = coalesce(rows.deleted_at, now())
  from victims
  where rows.object_ref = victims.object_ref;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('object_cleanup_queued', v_count);

  with victims as (
    select id
    from public.support_tickets
    where status <> 'deleted'
      and retention_expires_at <= now()
    order by retention_expires_at
    limit p_batch_size
    for update skip locked
  )
  update public.support_tickets rows
  set status = 'deleted',
      description = '[retention expired]',
      user_address = '[deleted]'
  from victims
  where rows.id = victims.id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('support_tickets', v_count);

  with victims as (
    select ctid
    from public.support_access_audit_events
    where created_at < now() - interval '2 years'
    order by created_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.support_access_audit_events rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('support_audit_events', v_count);

  with victims as (
    select ctid
    from public.mobile_spectre_backup_audit_events
    where created_at < now() - interval '2 years'
    order by created_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.mobile_spectre_backup_audit_events rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('backup_audit_events', v_count);

  with victims as (
    select user_id
    from public.account_deletion_jobs
    where status = 'completed'
      and completed_at < now() - interval '90 days'
      and (
        operation_token_expires_at is null
        or operation_token_expires_at <= now()
      )
    order by completed_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.account_deletion_jobs rows
  using victims
  where rows.user_id = victims.user_id;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('account_deletion_jobs', v_count);

  with victims as (
    select ctid
    from net._http_response
    where created < now() - interval '24 hours'
    order by created
    limit p_batch_size
  )
  delete from net._http_response rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('pg_net_responses', v_count);

  return v_result;
end;
$$;

create or replace function spectra_private.invoke_maintenance_webhook()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, vault, extensions
as $$
declare
  v_url text;
  v_bearer text;
  v_request_id bigint;
begin
  select decrypted_secret
  into v_url
  from vault.decrypted_secrets
  where name = 'spectra_maintenance_url';

  select decrypted_secret
  into v_bearer
  from vault.decrypted_secrets
  where name = 'spectra_maintenance_bearer';

  if v_url is null or v_bearer is null then
    return null;
  end if;

  if v_url !~ '^https://[^[:space:]]+$' or length(v_bearer) < 32 then
    raise exception using errcode = '22023', message = 'invalid maintenance Vault configuration';
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_bearer
    ),
    body := jsonb_build_object('task', 'drain_maintenance_queues')
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function spectra_private.enqueue_object_cleanup()
  from public, anon, authenticated;
revoke all on function spectra_private.read_maintenance_queue(text, integer, integer)
  from public, anon, authenticated;
revoke all on function spectra_private.delete_maintenance_message(text, bigint)
  from public, anon, authenticated;
revoke all on function spectra_private.maintenance_queue_metrics()
  from public, anon, authenticated;
revoke all on function spectra_private.run_retention_maintenance(integer)
  from public, anon, authenticated;
revoke all on function spectra_private.invoke_maintenance_webhook()
  from public, anon, authenticated;

grant execute on function spectra_private.read_maintenance_queue(text, integer, integer)
  to service_role;
grant execute on function spectra_private.delete_maintenance_message(text, bigint)
  to service_role;
grant execute on function spectra_private.maintenance_queue_metrics()
  to service_role;
grant execute on function spectra_private.run_retention_maintenance(integer)
  to service_role;
grant execute on function spectra_private.invoke_maintenance_webhook()
  to service_role;

do $cron$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'spectra-retention'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  for v_job_id in
    select jobid from cron.job where jobname = 'spectra-maintenance-webhook'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'spectra-retention',
    '*/5 * * * *',
    'select spectra_private.run_retention_maintenance(10000)'
  );

  perform cron.schedule(
    'spectra-maintenance-webhook',
    '*/5 * * * *',
    'select spectra_private.invoke_maintenance_webhook()'
  );
end
$cron$;
