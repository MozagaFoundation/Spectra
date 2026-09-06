create or replace function spectra_private.invoke_worker_webhook(p_worker text)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, vault, extensions
as $$
declare
  v_base_url text;
  v_secret text;
  v_url text;
  v_body jsonb;
  v_request_id bigint;
begin
  if p_worker not in ('janitor', 'wallet-worker', 'market-worker') then
    raise exception using errcode = '22023', message = 'invalid worker';
  end if;

  select decrypted_secret into v_base_url
  from vault.decrypted_secrets
  where name = 'spectra_edge_functions_base_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'spectra_maintenance_bearer';

  if v_base_url is null or v_secret is null then
    return null;
  end if;
  if
    v_base_url <> 'https://zaobpddfzrwbijfzohxs.supabase.co/functions/v1'
    or length(v_secret) < 32
    or length(v_secret) > 512
  then
    raise exception using errcode = '22023', message = 'invalid worker Vault configuration';
  end if;

  v_url := v_base_url || '/spectra-' || p_worker;
  v_body := case p_worker
    when 'janitor' then jsonb_build_object('accountLimit', 25)
    when 'wallet-worker' then jsonb_build_object(
      'chains', jsonb_build_array(),
      'limit', 50,
      'mode', 'all',
      'runId', 'cron:' || extensions.gen_random_uuid()::text
    )
    else '{}'::jsonb
  end;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Spectra-Internal-Secret', v_secret
    ),
    body := v_body,
    timeout_milliseconds := 5000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function spectra_private.invoke_worker_webhook(text)
  from public, anon, authenticated;
grant execute on function spectra_private.invoke_worker_webhook(text)
  to service_role;

do $cron$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname in (
      'spectra-maintenance-webhook',
      'spectra-janitor-worker',
      'spectra-wallet-worker',
      'spectra-market-worker'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'spectra-janitor-worker',
    '*/15 * * * *',
    $$select spectra_private.invoke_worker_webhook('janitor')$$
  );
  perform cron.schedule(
    'spectra-wallet-worker',
    '* * * * *',
    $$select spectra_private.invoke_worker_webhook('wallet-worker')$$
  );
  perform cron.schedule(
    'spectra-market-worker',
    '17 2 * * *',
    $$select spectra_private.invoke_worker_webhook('market-worker')$$
  );
end
$cron$;

drop function if exists spectra_private.invoke_maintenance_webhook();
