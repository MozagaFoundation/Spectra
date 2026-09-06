-- Normalized durable storage for sealed relay messages.
create table if not exists public.sealed_relay_messages (
  message_id text primary key default spectra_private.new_relay_message_id(),
  sender_user_id text not null,
  recipient_mailbox_token text not null
    references public.chat_mailbox_token_owners(mailbox_token) on delete cascade,
  delivery_token text,
  request_digest text,
  delivery_class text not null,
  sealed_envelope jsonb not null,
  status text not null default 'pending',
  server_sequence bigint generated always as identity unique,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  push_notification_enabled boolean not null default false,
  constraint sealed_relay_messages_id_check
    check (length(message_id) between 8 and 200),
  constraint sealed_relay_messages_sender_check
    check (length(sender_user_id) between 8 and 256),
  constraint sealed_relay_messages_delivery_token_check
    check (
      delivery_token is null
      or (
        length(delivery_token) = 49
        and delivery_token ~ '^sdv1[.][A-Za-z0-9+/]{43}=$'
      )
    ),
  constraint sealed_relay_messages_digest_check
    check (
      (delivery_token is null and request_digest is null)
      or (
        delivery_token is not null
        and request_digest ~ '^[0-9a-f]{64}$'
      )
    ),
  constraint sealed_relay_messages_class_check
    check (delivery_class in ('message', 'control')),
  constraint sealed_relay_messages_envelope_check
    check (
      jsonb_typeof(sealed_envelope) = 'object'
      and sealed_envelope ? 'version'
      and sealed_envelope ? 'type'
      and sealed_envelope ? 'ciphertext'
      and octet_length(sealed_envelope::text) <= 2097152
    ),
  constraint sealed_relay_messages_status_check
    check (status in ('pending', 'delivered', 'read', 'expired')),
  constraint sealed_relay_messages_status_time_check
    check (
      (status = 'pending' and delivered_at is null and read_at is null)
      or (status = 'delivered' and delivered_at is not null and read_at is null)
      or (
        status = 'read'
        and delivered_at is not null
        and read_at is not null
        and read_at >= delivered_at
      )
      or (
        status = 'expired'
        and (read_at is null or delivered_at is not null)
        and (read_at is null or read_at >= delivered_at)
      )
    ),
  constraint sealed_relay_messages_retention_check
    check (
      expires_at > created_at
      and expires_at <= created_at + interval '30 days'
    )
);

create unique index if not exists sealed_relay_messages_delivery_token_idx
  on public.sealed_relay_messages (delivery_token)
  where delivery_token is not null;
create index if not exists sealed_relay_messages_mailbox_fetch_idx
  on public.sealed_relay_messages (
    recipient_mailbox_token,
    delivery_class,
    server_sequence,
    message_id
  )
  where status = 'pending';
create index if not exists sealed_relay_messages_sender_cleanup_idx
  on public.sealed_relay_messages (sender_user_id, expires_at, message_id);
create index if not exists sealed_relay_messages_expiry_idx
  on public.sealed_relay_messages (expires_at, message_id);

comment on column public.sealed_relay_messages.sealed_envelope is
  'Opaque end-to-end encrypted envelope; never copy into logs, queues, or webhook payloads.';
