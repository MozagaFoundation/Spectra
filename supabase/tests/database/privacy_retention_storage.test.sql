begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(6);

insert into public.auth_wallet_bindings (
  wallet_address,
  user_id,
  public_key,
  verified_at
) values (
  'EXO00' || repeat('5', 38),
  'retention-owner',
  '0x' || repeat('f', 3904),
  now()
);

insert into public.chat_mailbox_token_owners (
  mailbox_token,
  user_id,
  wallet_address
) values (
  'smbx2.retentiontest',
  'retention-owner',
  'EXO00' || repeat('5', 38)
);

insert into public.sealed_relay_messages (
  message_id,
  sender_user_id,
  recipient_mailbox_token,
  delivery_class,
  sealed_envelope,
  status,
  created_at,
  expires_at
) values (
  'msg_ret_expired_control',
  'retention-sender',
  'smbx2.retentiontest',
  'control',
  '{"version":1,"type":"control","ciphertext":"opaque"}'::jsonb,
  'pending',
  now() - interval '2 days',
  now() - interval '1 hour'
), (
  'msg_ret_live_message',
  'retention-sender',
  'smbx2.retentiontest',
  'message',
  '{"version":1,"type":"message","ciphertext":"opaque"}'::jsonb,
  'pending',
  now(),
  now() + interval '6 days'
);

insert into public.wallet_index_cursors (
  chain,
  cursor_name,
  last_scanned_height,
  last_finalized_height,
  updated_at
) values (
  'tron',
  'transactions',
  5000,
  5000,
  now()
)
on conflict (chain, cursor_name) do update set
  last_scanned_height = excluded.last_scanned_height,
  last_finalized_height = excluded.last_finalized_height,
  updated_at = excluded.updated_at;

insert into public.wallet_index_chain_blocks (
  chain,
  block_height,
  block_hash,
  indexed_at
) values (
  'tron',
  100,
  'retention-old-hash',
  now()
), (
  'tron',
  5000,
  'retention-tip-hash',
  now()
)
on conflict (chain, block_height) do update set
  block_hash = excluded.block_hash,
  indexed_at = excluded.indexed_at;

insert into public.wallet_indexer_runs (
  run_id,
  chain,
  mode,
  requested_chains,
  started_at,
  finished_at,
  status
) values (
  'retention-old-run',
  'tron',
  'transactions',
  array['tron'],
  now() - interval '8 days',
  now() - interval '8 days',
  'completed'
), (
  'retention-new-run',
  'tron',
  'transactions',
  array['tron'],
  now() - interval '1 day',
  now() - interval '1 day',
  'completed'
);

select is(
  position(
    'wallet_index_user_addresses' in pg_get_functiondef(
      'spectra_private.run_privacy_retention_maintenance(integer)'::regprocedure
    )
  ),
  0,
  'privacy retention does not reference dropped wallet_index_user_addresses'
);

select lives_ok(
  $$
    select spectra_private.run_privacy_retention_maintenance(10000)
  $$,
  'privacy retention runs without aborting'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.sealed_relay_messages
    where message_id = 'msg_ret_expired_control'
  $$,
  array[0::bigint],
  'expired sealed relay rows are deleted'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.sealed_relay_messages
    where message_id = 'msg_ret_live_message'
  $$,
  array[1::bigint],
  'unexpired pending messages stay until acknowledged or expired'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.wallet_index_chain_blocks
    where chain = 'tron'
      and block_hash in ('retention-old-hash', 'retention-tip-hash')
      and block_height = 100
  $$,
  array[0::bigint],
  'chain blocks below the reorg window are deleted'
);

select results_eq(
  $$
    select
      exists(
        select 1 from public.wallet_index_chain_blocks
        where chain = 'tron' and block_hash = 'retention-tip-hash'
      ),
      exists(
        select 1 from public.wallet_indexer_runs where run_id = 'retention-old-run'
      ),
      exists(
        select 1 from public.wallet_indexer_runs where run_id = 'retention-new-run'
      )
  $$,
  $$values (true, false, true)$$,
  'recent chain tip and indexer runs remain; runs older than 7 days are deleted'
);

select * from finish();

rollback;
