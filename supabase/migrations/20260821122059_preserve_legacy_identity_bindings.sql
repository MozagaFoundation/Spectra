create or replace function spectra_private.consume_wallet_challenge(
  p_challenge text,
  p_user_id text,
  p_wallet_address text,
  p_public_key text,
  p_identity_id text default null
)
returns public.auth_wallet_bindings
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_verified_at timestamptz;
  v_binding public.auth_wallet_bindings;
  v_previous_user_id text;
begin
  delete from public.auth_wallet_challenges
  where challenge = p_challenge
    and user_id = p_user_id
    and wallet_address = p_wallet_address
    and consumed_at is null
    and expires_at > now()
  returning greatest(now(), created_at) into v_verified_at;

  if not found then
    return null;
  end if;

  select bindings.user_id
  into v_previous_user_id
  from public.auth_wallet_bindings bindings
  where bindings.wallet_address = p_wallet_address
  for update;

  if found and v_previous_user_id <> p_user_id then
    update public.auth_refresh_tokens
    set revoked_at = coalesce(revoked_at, v_verified_at)
    where wallet_address = p_wallet_address
      and revoked_at is null;
  end if;

  insert into public.auth_wallet_bindings (
    wallet_address,
    user_id,
    public_key,
    identity_id,
    verified_at,
    updated_at
  ) values (
    p_wallet_address,
    p_user_id,
    p_public_key,
    nullif(btrim(p_identity_id), ''),
    v_verified_at,
    v_verified_at
  )
  on conflict (wallet_address) do update set
    user_id = excluded.user_id,
    public_key = excluded.public_key,
    identity_id = case
      when excluded.identity_id is not null then excluded.identity_id
      when public.auth_wallet_bindings.user_id = excluded.user_id
        then public.auth_wallet_bindings.identity_id
      else null
    end,
    verified_at = excluded.verified_at,
    updated_at = excluded.updated_at
  returning * into v_binding;

  return v_binding;
end;
$$;
