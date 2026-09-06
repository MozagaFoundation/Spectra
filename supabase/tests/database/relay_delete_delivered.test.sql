begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(7);

insert into public.auth_wallet_bindings (
  wallet_address,
  user_id,
  public_key,
  verified_at
) values (
  'EXO00' || repeat('1', 38),
  'relay-delete-owner',
  '0x' || repeat('b', 3904),
  now()
), (
  'EXO00' || repeat('2', 38),
  'relay-delete-other',
  '0x' || repeat('c', 3904),
  now()
);

insert into public.chat_mailbox_token_owners (
  mailbox_token,
  user_id,
  wallet_address
) values (
  'smbx2.deletetest',
  'relay-delete-owner',
  'EXO00' || repeat('1', 38)
), (
  'smbx2.deleteother',
  'relay-delete-other',
  'EXO00' || repeat('2', 38)
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
  'msg_del_pending',
  'relay-delete-sender',
  'smbx2.deletetest',
  'message',
  '{"version":1,"type":"message","ciphertext":"opaque"}'::jsonb,
  'pending',
  null,
  null
), (
  'msg_del_delivered',
  'relay-delete-sender',
  'smbx2.deletetest',
  'message',
  '{"version":1,"type":"message","ciphertext":"opaque"}'::jsonb,
  'delivered',
  now(),
  null
), (
  'msg_del_read',
  'relay-delete-sender',
  'smbx2.deletetest',
  'message',
  '{"version":1,"type":"message","ciphertext":"opaque"}'::jsonb,
  'read',
  now(),
  now()
), (
  'msg_del_foreign',
  'relay-delete-sender',
  'smbx2.deleteother',
  'message',
  '{"version":1,"type":"message","ciphertext":"opaque"}'::jsonb,
  'delivered',
  now(),
  null
), (
  'msg_del_pending_control',
  'relay-delete-sender',
  'smbx2.deletetest',
  'control',
  '{"version":1,"type":"control","ciphertext":"opaque"}'::jsonb,
  'pending',
  null,
  null
), (
  'msg_del_foreign_control',
  'relay-delete-sender',
  'smbx2.deleteother',
  'control',
  '{"version":1,"type":"control","ciphertext":"opaque"}'::jsonb,
  'pending',
  null,
  null
);

select results_eq(
  $$
    select spectra_private.delete_sealed_relay_messages(
      'relay-delete-owner',
      array['msg_del_delivered', 'msg_del_read']
    )
  $$,
  array[2],
  'owner can delete delivered and read relay rows'
);

select results_eq(
  $$
    select spectra_private.delete_sealed_relay_messages(
      'relay-delete-owner',
      array['msg_del_delivered']
    )
  $$,
  array[1],
  'deleting an already-removed delivered row is idempotent'
);

select results_eq(
  $$
    select spectra_private.delete_sealed_relay_messages(
      'relay-delete-owner',
      array['msg_del_pending']
    )
  $$,
  array[0],
  'pending message rows stay until delivery is acknowledged'
);

select results_eq(
  $$
    select spectra_private.delete_sealed_relay_messages(
      'relay-delete-owner',
      array['msg_del_pending_control']
    )
  $$,
  array[1],
  'owner can delete pending control after authenticated open'
);

select throws_ok(
  $$
    select spectra_private.delete_sealed_relay_messages(
      'relay-delete-owner',
      array['msg_del_foreign']
    )
  $$,
  '42501',
  'relay message unavailable',
  'owner cannot delete another mailbox'
);

select throws_ok(
  $$
    select spectra_private.delete_sealed_relay_messages(
      'relay-delete-owner',
      array['msg_del_foreign_control']
    )
  $$,
  '42501',
  'relay message unavailable',
  'owner cannot delete another mailbox control row'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.sealed_relay_messages
    where message_id in (
      'msg_del_pending',
      'msg_del_delivered',
      'msg_del_read',
      'msg_del_foreign',
      'msg_del_pending_control',
      'msg_del_foreign_control'
    )
  $$,
  array[3::bigint],
  'only pending message and foreign rows remain'
);

select * from finish();

rollback;
