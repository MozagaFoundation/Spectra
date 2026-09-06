begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(5);

insert into public.auth_wallet_bindings (
  wallet_address,
  user_id,
  public_key,
  verified_at
) values (
  'EXO00' || repeat('0', 38),
  'relay-recipient',
  '0x' || repeat('a', 3904),
  now()
);

insert into public.chat_mailbox_token_owners (
  mailbox_token,
  user_id,
  wallet_address
) values (
  'smbx2.relaytest',
  'relay-recipient',
  'EXO00' || repeat('0', 38)
);

select results_eq(
  $$
    select status = 'pending' and not replayed
    from spectra_private.store_sealed_relay_message(
      'relay-sender',
      'smbx2.relaytest',
      'sdv1.' || repeat('A', 43) || '=',
      'message',
      '{"version":1,"type":"message","ciphertext":"opaque"}'::jsonb,
      false,
      interval '7 days'
    )
  $$,
  array[true],
  'the first relay acceptance is stored'
);

update public.sealed_relay_messages
set status = 'delivered',
    delivered_at = now()
where recipient_mailbox_token = 'smbx2.relaytest';

select results_eq(
  $$
    select status = 'pending' and replayed
    from spectra_private.store_sealed_relay_message(
      'relay-sender',
      'smbx2.relaytest',
      'sdv1.' || repeat('A', 43) || '=',
      'message',
      '{"version":1,"type":"message","ciphertext":"opaque"}'::jsonb,
      false,
      interval '7 days'
    )
  $$,
  array[true],
  'a replay preserves the original pending acceptance'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.sealed_relay_messages
    where recipient_mailbox_token = 'smbx2.relaytest'
  $$,
  array[1::bigint],
  'idempotent acceptance stores one relay row'
);

select results_eq(
  $$
    select count(*)::bigint
    from pgmq.q_relay_notifications
    where message->>'recipient_mailbox_token' = 'smbx2.relaytest'
  $$,
  array[1::bigint],
  'idempotent acceptance enqueues one notification'
);

select results_eq(
  $$
    select count(*)::bigint
    from pgmq.q_relay_notifications
    where message->>'recipient_mailbox_token' = 'smbx2.relaytest'
      and not message ? 'sealed_envelope'
      and not message ? 'sender_user_id'
      and not message ? 'delivery_token'
  $$,
  array[1::bigint],
  'the durable notification contains no sealed content or sender capability'
);

select * from finish();
rollback;
