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
  'EXO00' || repeat('3', 38),
  'relay-vacuum-owner',
  '0x' || repeat('d', 3904),
  now()
), (
  'EXO00' || repeat('4', 38),
  'relay-vacuum-other',
  '0x' || repeat('e', 3904),
  now()
);

insert into public.chat_mailbox_token_owners (
  mailbox_token,
  user_id,
  wallet_address
) values (
  'smbx2.vacuumtest',
  'relay-vacuum-owner',
  'EXO00' || repeat('3', 38)
), (
  'smbx2.vacuumother',
  'relay-vacuum-other',
  'EXO00' || repeat('4', 38)
);

insert into public.sealed_relay_messages (
  message_id,
  sender_user_id,
  recipient_mailbox_token,
  delivery_class,
  sealed_envelope,
  status,
  delivered_at,
  read_at
) values (
  'msg_vac_pending',
  'relay-vacuum-sender',
  'smbx2.vacuumtest',
  'message',
  '{"version":1,"type":"message","ciphertext":"opaque"}'::jsonb,
  'pending',
  null,
  null
), (
  'msg_vac_delivered',
  'relay-vacuum-sender',
  'smbx2.vacuumtest',
  'message',
  '{"version":1,"type":"message","ciphertext":"opaque"}'::jsonb,
  'delivered',
  now(),
  null
), (
  'msg_vac_read',
  'relay-vacuum-sender',
  'smbx2.vacuumtest',
  'message',
  '{"version":1,"type":"message","ciphertext":"opaque"}'::jsonb,
  'read',
  now(),
  now()
), (
  'msg_vac_foreign',
  'relay-vacuum-sender',
  'smbx2.vacuumother',
  'message',
  '{"version":1,"type":"message","ciphertext":"opaque"}'::jsonb,
  'read',
  now(),
  now()
);

select results_eq(
  $$
    select spectra_private.vacuum_sealed_relay_messages(
      'relay-vacuum-owner',
      (
        select max(server_sequence)
        from public.sealed_relay_messages
        where recipient_mailbox_token in ('smbx2.vacuumtest', 'smbx2.vacuumother')
      ),
      array['read']::text[]
    )
  $$,
  array[1],
  'owner vacuum removes read rows at or below the cursor'
);

select results_eq(
  $$
    select spectra_private.vacuum_sealed_relay_messages(
      'relay-vacuum-owner',
      (
        select max(server_sequence)
        from public.sealed_relay_messages
        where recipient_mailbox_token in ('smbx2.vacuumtest', 'smbx2.vacuumother')
      ),
      array['delivered', 'read']::text[]
    )
  $$,
  array[1],
  'owner vacuum can also drop delivered rows when asked'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.sealed_relay_messages
    where message_id = 'msg_vac_pending'
  $$,
  array[1::bigint],
  'pending rows below the cursor are not vacuumed'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.sealed_relay_messages
    where message_id = 'msg_vac_foreign'
  $$,
  array[1::bigint],
  'vacuum cannot delete another mailbox'
);

select results_eq(
  $$
    select spectra_private.vacuum_sealed_relay_messages(
      'relay-vacuum-owner',
      0,
      array['read']::text[]
    )
  $$,
  array[0],
  'vacuum without a cursor is a no-op'
);

select throws_ok(
  $$
    select spectra_private.vacuum_sealed_relay_messages(
      'relay-vacuum-owner',
      20,
      array['pending']::text[]
    )
  $$,
  '22023',
  'invalid relay vacuum status',
  'vacuum rejects pending as a status'
);

select * from finish();

rollback;
