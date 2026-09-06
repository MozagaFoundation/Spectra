-- Keep Bitcoin transaction history independent from slow UTXO balance scans.

create or replace function spectra_private.invoke_wallet_worker_webhook(p_chain text)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, vault, extensions
as $$
declare
  v_base_url text;
  v_secret text;
  v_mode text;
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

  v_mode := case when p_chain = 'bitcoin' then 'transactions' else 'all' end;
  select net.http_post(
    url := v_base_url || '/spectra-wallet-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Spectra-Internal-Secret', v_secret
    ),
    body := jsonb_build_object(
      'chains', jsonb_build_array(p_chain),
      'limit', 50,
      'mode', v_mode,
      'runId', 'cron:' || p_chain || ':' || extensions.gen_random_uuid()::text
    ),
    timeout_milliseconds := 120000
  )
  into v_request_id;

  return v_request_id;
end;
$$;
