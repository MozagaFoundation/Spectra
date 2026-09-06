begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(5);

insert into public.auth_wallet_bindings (
  wallet_address,
  user_id,
  public_key,
  identity_id,
  primary_mailbox_token,
  identity_key_digest,
  verified_at
) values (
  'EXO00' || repeat('2', 38),
  'legacy-owner',
  '0x' || repeat('a', 3904),
  'legacy-identity',
  'smbx1.legacyfullbinding',
  repeat('a', 64),
  now()
);

insert into public.auth_wallet_challenges (
  challenge,
  user_id,
  wallet_address,
  expires_at
) values (
  repeat('c', 32),
  'legacy-owner',
  'EXO00' || repeat('2', 38),
  now() + interval '1 minute'
);

select results_eq(
  $$
    select identity_id
    from spectra_private.consume_wallet_challenge(
      repeat('c', 32),
      'legacy-owner',
      'EXO00' || repeat('2', 38),
      '0x' || repeat('a', 3904),
      null
    )
  $$,
  array['legacy-identity'],
  'wallet-only verification preserves a same-owner legacy identity'
);

select results_eq(
  $$
    select primary_mailbox_token = 'smbx1.legacyfullbinding'
      and identity_key_digest = repeat('a', 64)
    from public.auth_wallet_bindings
    where wallet_address = 'EXO00' || repeat('2', 38)
  $$,
  array[true],
  'wallet-only verification preserves existing private binding material'
);

insert into public.auth_wallet_challenges (
  challenge,
  user_id,
  wallet_address,
  expires_at
) values (
  repeat('e', 32),
  'legacy-owner',
  'EXO00' || repeat('2', 38),
  now() + interval '1 minute'
);

select results_eq(
  $$
    select identity_id
    from spectra_private.consume_wallet_challenge(
      repeat('e', 32),
      'legacy-owner',
      'EXO00' || repeat('2', 38),
      '0x' || repeat('a', 3904),
      'replacement-identity'
    )
  $$,
  array['replacement-identity'],
  'an explicit identity input replaces a legacy identity'
);

insert into public.auth_wallet_challenges (
  challenge,
  user_id,
  wallet_address,
  expires_at
) values (
  repeat('d', 32),
  'new-owner',
  'EXO00' || repeat('2', 38),
  now() + interval '1 minute'
);

select results_eq(
  $$
    select identity_id is null
    from spectra_private.consume_wallet_challenge(
      repeat('d', 32),
      'new-owner',
      'EXO00' || repeat('2', 38),
      '0x' || repeat('b', 3904),
      null
    )
  $$,
  array[true],
  'wallet-only verification never transfers a legacy identity to another owner'
);

insert into public.auth_wallet_challenges (
  challenge,
  user_id,
  wallet_address,
  expires_at
) values (
  repeat('f', 32),
  'first-owner',
  'EXO00' || repeat('3', 38),
  now() + interval '1 minute'
);

select results_eq(
  $$
    select identity_id is null
    from spectra_private.consume_wallet_challenge(
      repeat('f', 32),
      'first-owner',
      'EXO00' || repeat('3', 38),
      '0x' || repeat('c', 3904),
      null
    )
  $$,
  array[true],
  'first-time wallet-only verification remains identity-free'
);

select * from finish();
rollback;
