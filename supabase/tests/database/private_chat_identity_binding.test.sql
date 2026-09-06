begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(10);

insert into public.auth_wallet_bindings (
  wallet_address,
  user_id,
  public_key,
  identity_id,
  primary_mailbox_token,
  identity_key_digest,
  verified_at
) values (
  'EXO00' || repeat('1', 38),
  'private-binding-owner',
  '0x' || repeat('a', 3904),
  'old-identity',
  'smbx1.privatebindingold',
  repeat('a', 64),
  now()
);

insert into public.auth_refresh_tokens (
  token_hash,
  session_id,
  user_id,
  wallet_address,
  identity_id,
  expires_at
) values (
  repeat('b', 64),
  'private-binding-old-session',
  'private-binding-owner',
  'EXO00' || repeat('1', 38),
  'old-identity',
  now() + interval '1 day'
);

insert into public.chat_mailbox_token_owners (
  mailbox_token,
  user_id,
  wallet_address
) values (
  'smbx1.privatebindingold',
  'private-binding-owner',
  'EXO00' || repeat('1', 38)
);

select lives_ok(
  $$
    select spectra_private.bind_chat_identity(
      'private-binding-owner',
      'EXO00' || repeat('1', 38),
      'new-identity',
      'smbx1.privatebindingnew',
      repeat('c', 64)
    )
  $$,
  'a wallet-authenticated private identity binding is accepted'
);

select results_eq(
  $$
    select identity_id = 'new-identity'
      and primary_mailbox_token = 'smbx1.privatebindingnew'
      and identity_key_digest = repeat('c', 64)
    from public.auth_wallet_bindings
    where user_id = 'private-binding-owner'
  $$,
  array[true],
  'the binding persists only identity routing material'
);

select results_eq(
  $$
    select mailbox_token
    from public.chat_mailbox_token_owners
    where user_id = 'private-binding-owner'
    order by mailbox_token
  $$,
  array['smbx1.privatebindingnew'],
  'a replacement persona cannot retain prior mailbox ownership'
);

select results_eq(
  $$
    select revoked_at is not null
    from public.auth_refresh_tokens
    where session_id = 'private-binding-old-session'
  $$,
  array[true],
  'prior identity refresh sessions are revoked'
);

select throws_ok(
  $$
    select spectra_private.bind_chat_identity(
      'private-binding-owner',
      'EXO00' || repeat('1', 38),
      'new-identity',
      'smbx1.privatebindingnew',
      repeat('d', 64)
    )
  $$,
  '22023',
  'chat identity keys changed',
  'an existing identity ID cannot be rebound to different identity keys'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.chat_key_bundles
    where owner_user_id = 'private-binding-owner'
  $$,
  array[0::bigint],
  'private binding does not create a public discovery bundle'
);

select lives_ok(
  $$
    select spectra_private.bind_chat_identity(
      'private-binding-owner',
      'EXO00' || repeat('1', 38),
      'new-identity',
      'smbx1.' || repeat('m', 250),
      repeat('c', 64)
    )
  $$,
  'a maximum-length primary mailbox token is accepted'
);

select throws_ok(
  $$
    select spectra_private.bind_chat_identity(
      'private-binding-owner',
      'EXO00' || repeat('1', 38),
      'new-identity',
      'smbx1.' || repeat('m', 251),
      repeat('c', 64)
    )
  $$,
  '22023',
  'invalid chat identity binding',
  'an oversized primary mailbox token is rejected'
);

insert into public.auth_wallet_bindings (
  wallet_address,
  user_id,
  public_key,
  identity_id,
  verified_at
) values (
  'EXO00' || repeat('2', 38),
  'legacy-partial-owner',
  '0x' || repeat('e', 3904),
  'legacy-partial-identity',
  now()
);

select lives_ok(
  $$
    select spectra_private.bind_chat_identity(
      'legacy-partial-owner',
      'EXO00' || repeat('2', 38),
      'legacy-partial-identity',
      'smbx1.legacyprivatebinding',
      repeat('f', 64)
    )
  $$,
  'a legacy partial binding can be completed by the same identity'
);

select results_eq(
  $$
    select primary_mailbox_token = 'smbx1.legacyprivatebinding'
      and identity_key_digest = repeat('f', 64)
    from public.auth_wallet_bindings
    where wallet_address = 'EXO00' || repeat('2', 38)
  $$,
  array[true],
  'completing a legacy binding preserves its identity ID'
);

select * from finish();
rollback;
