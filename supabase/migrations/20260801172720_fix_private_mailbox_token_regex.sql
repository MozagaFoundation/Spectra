alter table public.auth_wallet_bindings
  drop constraint if exists auth_wallet_bindings_primary_mailbox_token_check,
  add constraint auth_wallet_bindings_primary_mailbox_token_check
    check (
      primary_mailbox_token is null or (
        primary_mailbox_token ~ '^smbx1[.][^[:space:]:]{8,250}$'
        and length(primary_mailbox_token) between 14 and 256
        and primary_mailbox_token !~ '[[:cntrl:]:]'
      )
    );

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
