alter table public.auth_wallet_bindings
  add column if not exists primary_mailbox_token text,
  add column if not exists identity_key_digest text;

alter table public.auth_wallet_bindings
  drop constraint if exists auth_wallet_bindings_primary_mailbox_token_check,
  add constraint auth_wallet_bindings_primary_mailbox_token_check
    check (
      primary_mailbox_token is null or (
        primary_mailbox_token ~ '^smbx1[.][^[:space:]:]{8,250}$'
        and length(primary_mailbox_token) between 14 and 256
        and primary_mailbox_token !~ '[[:cntrl:]:]'
      )
    ),
  drop constraint if exists auth_wallet_bindings_identity_key_digest_check,
  add constraint auth_wallet_bindings_identity_key_digest_check
    check (
      identity_key_digest is null
      or identity_key_digest ~ '^[0-9a-f]{64}$'
    );

create index if not exists auth_wallet_bindings_private_identity_idx
  on public.auth_wallet_bindings (user_id, wallet_address, identity_id)
  where identity_id is not null
    and primary_mailbox_token is not null
    and identity_key_digest is not null;

create or replace function spectra_private.claim_chat_one_time_prekey(
  p_requestor_user_id text,
  p_requestor_wallet_address text,
  p_target_identity_id text,
  p_requestor_identity_id text
)
returns table (opk_id integer, opk jsonb)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id integer;
  v_opk jsonb;
begin
  if p_target_identity_id = p_requestor_identity_id then
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_target_identity_id || chr(31) || p_requestor_user_id, 0)
  );

  if not exists (
    select 1
    from public.auth_wallet_bindings bindings
    where bindings.user_id = p_requestor_user_id
      and lower(bindings.wallet_address) = lower(p_requestor_wallet_address)
      and bindings.identity_id = p_requestor_identity_id
      and bindings.primary_mailbox_token is not null
      and bindings.identity_key_digest is not null
  ) then
    raise exception using errcode = '42501', message = 'requestor identity is not bound';
  end if;

  if exists (
    select 1
    from public.chat_one_time_prekeys keys
    where keys.identity_id = p_target_identity_id
      and keys.requestor_user_id = p_requestor_user_id
      and keys.consumed_at is not null
  ) then
    return;
  end if;

  select keys.opk_id, keys.opk
  into v_id, v_opk
  from public.chat_one_time_prekeys keys
  where keys.identity_id = p_target_identity_id
    and keys.consumed_at is null
  order by keys.opk_id
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.chat_one_time_prekeys keys
  set requestor_id = p_requestor_identity_id,
      requestor_user_id = p_requestor_user_id,
      consumed_at = now()
  where keys.identity_id = p_target_identity_id
    and keys.opk_id = v_id
    and keys.consumed_at is null;

  if not found then
    return;
  end if;

  return query select v_id, v_opk;
end;
$$;

revoke all on function spectra_private.claim_chat_one_time_prekey(text, text, text, text)
  from public, anon, authenticated;
grant execute on function spectra_private.claim_chat_one_time_prekey(text, text, text, text)
  to service_role;

create or replace function spectra_private.bind_chat_identity(
  p_user_id text,
  p_wallet_address text,
  p_identity_id text,
  p_primary_mailbox_token text,
  p_identity_key_digest text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current_identity_id text;
  v_current_key_digest text;
begin
  if
    p_identity_id is null
    or length(p_identity_id) not between 8 and 256
    or p_primary_mailbox_token is null
    or p_primary_mailbox_token !~ '^smbx1[.][^[:space:]:]{8,250}$'
    or length(p_primary_mailbox_token) not between 14 and 256
    or p_primary_mailbox_token ~ '[[:cntrl:]:]'
    or p_identity_key_digest is null
    or p_identity_key_digest !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'invalid chat identity binding';
  end if;

  select identity_id, identity_key_digest
  into v_current_identity_id, v_current_key_digest
  from public.auth_wallet_bindings
  where user_id = p_user_id
    and lower(wallet_address) = lower(p_wallet_address)
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'wallet binding is not owned';
  end if;

  if
    v_current_identity_id = p_identity_id
    and v_current_key_digest is not null
    and v_current_key_digest <> p_identity_key_digest
  then
    raise exception using errcode = '22023', message = 'chat identity keys changed';
  end if;

  update public.auth_wallet_bindings
  set identity_id = p_identity_id,
      primary_mailbox_token = p_primary_mailbox_token,
      identity_key_digest = p_identity_key_digest
  where user_id = p_user_id
    and lower(wallet_address) = lower(p_wallet_address);

  perform spectra_private.register_mailbox_tokens(
    p_user_id,
    p_wallet_address,
    array[p_primary_mailbox_token]
  );

  if v_current_identity_id is distinct from p_identity_id then
    update public.auth_refresh_tokens
    set revoked_at = greatest(now(), created_at)
    where user_id = p_user_id
      and lower(wallet_address) = lower(p_wallet_address)
      and identity_id is not null
      and identity_id <> p_identity_id
      and rotated_at is null
      and revoked_at is null;

    delete from public.chat_mailbox_token_owners
    where user_id = p_user_id
      and lower(wallet_address) = lower(p_wallet_address)
      and mailbox_token <> p_primary_mailbox_token;
  end if;
end;
$$;

revoke all on function spectra_private.bind_chat_identity(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function spectra_private.bind_chat_identity(text, text, text, text, text)
  to service_role;

create or replace function spectra_private.claim_chat_one_time_prekey(
  p_requestor_user_id text,
  p_target_identity_id text,
  p_requestor_identity_id text
)
returns table (opk_id integer, opk jsonb)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_wallet_address text;
begin
  select wallet_address
  into v_wallet_address
  from public.auth_wallet_bindings bindings
  where bindings.user_id = p_requestor_user_id
    and bindings.identity_id = p_requestor_identity_id
    and bindings.primary_mailbox_token is not null
    and bindings.identity_key_digest is not null;

  if not found then
    raise exception using errcode = '42501', message = 'requestor identity is not bound';
  end if;

  return query
    select * from spectra_private.claim_chat_one_time_prekey(
      p_requestor_user_id,
      v_wallet_address,
      p_target_identity_id,
      p_requestor_identity_id
    );
end;
$$;

revoke all on function spectra_private.claim_chat_one_time_prekey(text, text, text)
  from public, anon, authenticated;
grant execute on function spectra_private.claim_chat_one_time_prekey(text, text, text)
  to service_role;
