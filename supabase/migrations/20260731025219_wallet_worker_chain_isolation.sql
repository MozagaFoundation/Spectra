-- Isolate live indexing so one slow provider cannot terminate other chains.

create or replace function spectra_private.invoke_wallet_worker_webhook(p_chain text)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, vault, extensions
as $$
declare
  v_base_url text;
  v_secret text;
  v_request_id bigint;
begin
  if p_chain not in ('mozaga', 'ethereum', 'bitcoin', 'solana', 'tron') then
    raise exception using errcode = '22023', message = 'invalid wallet chain';
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

  select net.http_post(
    url := v_base_url || '/spectra-wallet-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Spectra-Internal-Secret', v_secret
    ),
    body := jsonb_build_object(
      'chains', jsonb_build_array(p_chain),
      'limit', 50,
      'mode', 'all',
      'runId', 'cron:' || p_chain || ':' || extensions.gen_random_uuid()::text
    ),
    timeout_milliseconds := 120000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function spectra_private.invoke_wallet_worker_webhook(text)
  from public, anon, authenticated;
grant execute on function spectra_private.invoke_wallet_worker_webhook(text)
  to service_role;

do $cron$
declare
  v_job_id bigint;
  v_chain text;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname in (
      'spectra-wallet-worker',
      'spectra-wallet-live-mozaga',
      'spectra-wallet-live-ethereum',
      'spectra-wallet-live-bitcoin',
      'spectra-wallet-live-solana',
      'spectra-wallet-live-tron'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  for v_chain in
    select unnest(array['mozaga', 'ethereum', 'bitcoin', 'solana', 'tron']::text[])
  loop
    perform cron.schedule(
      'spectra-wallet-live-' || v_chain,
      '* * * * *',
      format('select spectra_private.invoke_wallet_worker_webhook(%L)', v_chain)
    );
  end loop;
end
$cron$;
