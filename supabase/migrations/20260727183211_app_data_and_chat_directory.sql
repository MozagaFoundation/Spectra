create table if not exists public.mobile_app_records (
  record_table text not null,
  record_id text not null,
  body jsonb not null,
  owner_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (record_table, record_id),
  constraint mobile_app_records_table_check
    check (record_table ~ '^[a-z][a-z0-9_]{1,96}$'),
  constraint mobile_app_records_id_check
    check (length(record_id) between 1 and 256),
  constraint mobile_app_records_owner_check
    check (owner_user_id is null or length(owner_user_id) between 8 and 256),
  constraint mobile_app_records_body_check
    check (jsonb_typeof(body) = 'object'),
  constraint mobile_app_records_notification_scope_check
    check (
      record_table <> 'notification_token_registrations'
      or (
        nullif(btrim(body->>'wallet_address'), '') is not null
        and (
          (
            nullif(btrim(body->>'notification_scope_id'), '') is null
            and body->>'id' = record_id
            and lower(body->>'id') = lower(body->>'wallet_address')
          )
          or (
            body->>'notification_scope_id' ~ '^nsc1[.][0-9a-f]{32}$'
            and body->>'id' = body->>'notification_scope_id'
            and record_id = body->>'notification_scope_id'
          )
        )
      )
    )
);

create index if not exists mobile_app_records_table_updated_idx
  on public.mobile_app_records (record_table, updated_at desc);
create index if not exists mobile_app_records_owner_table_idx
  on public.mobile_app_records (owner_user_id, record_table, updated_at desc)
  where owner_user_id is not null;
create index if not exists mobile_app_records_body_gin_idx
  on public.mobile_app_records using gin (body jsonb_path_ops);
create index if not exists mobile_app_notification_wallet_scope_idx
  on public.mobile_app_records (lower(body->>'wallet_address'), record_id)
  where record_table = 'notification_token_registrations';
create unique index if not exists mobile_app_group_identity_unique_idx
  on public.mobile_app_records ((body->>'id'))
  where record_table = 'chat_groups';
create unique index if not exists mobile_app_group_member_unique_idx
  on public.mobile_app_records ((body->>'group_id'), (body->>'user_identity_id'))
  where record_table = 'chat_group_members';
create index if not exists mobile_app_group_member_access_idx
  on public.mobile_app_records (
    (body->>'group_id'),
    (body->>'user_identity_id'),
    (body->>'is_active')
  )
  where record_table = 'chat_group_members';
create index if not exists mobile_app_chat_media_access_idx
  on public.mobile_app_records (
    record_id,
    (body->>'conversation_id'),
    (body->>'sender_identity_id'),
    (body->>'recipient_identity_id')
  )
  where record_table = 'chat_media';

create sequence if not exists public.group_message_server_sequence_seq
  as bigint minvalue 1 start with 1 increment by 1 cache 100;

create index if not exists mobile_app_group_message_epoch_idx
  on public.mobile_app_records (
    (body->>'group_id'),
    ((body->>'key_version')::bigint),
    ((body->>'server_sequence')::bigint)
  )
  where record_table = 'chat_group_messages'
    and body->>'key_version' ~ '^[0-9]+$'
    and body->>'server_sequence' ~ '^[0-9]+$';

create table if not exists public.chat_key_bundles (
  identity_id text primary key,
  wallet_address text,
  pseudonym text,
  recipient_mailbox_token text not null unique,
  bundle jsonb not null,
  owner_user_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_key_bundles_identity_check
    check (length(identity_id) between 8 and 256),
  constraint chat_key_bundles_wallet_check
    check (wallet_address is null or wallet_address ~ '^EXO00[0-9a-f]{38}$'),
  constraint chat_key_bundles_pseudonym_check
    check (pseudonym is null or pseudonym ~ '^@[A-Za-z0-9_.-]{3,64}$'),
  constraint chat_key_bundles_mailbox_check
    check (
      (recipient_mailbox_token like 'smbx1.%' or recipient_mailbox_token like 'smbx2.%')
      and length(recipient_mailbox_token) between 22 and 256
      and recipient_mailbox_token !~ '[[:space:][:cntrl:]:]'
    ),
  constraint chat_key_bundles_bundle_check
    check (jsonb_typeof(bundle) = 'object'),
  constraint chat_key_bundles_owner_check
    check (length(owner_user_id) between 8 and 256),
  constraint chat_key_bundles_wallet_owner_fk
    foreign key (owner_user_id, wallet_address)
    references public.auth_wallet_bindings(user_id, wallet_address)
    on delete cascade
);

create unique index if not exists chat_key_bundles_wallet_unique_idx
  on public.chat_key_bundles (lower(wallet_address))
  where wallet_address is not null;
create unique index if not exists chat_key_bundles_pseudonym_unique_idx
  on public.chat_key_bundles (lower(pseudonym))
  where pseudonym is not null;
create index if not exists chat_key_bundles_owner_idx
  on public.chat_key_bundles (owner_user_id);
create index if not exists chat_key_bundles_wallet_owner_fk_idx
  on public.chat_key_bundles (owner_user_id, wallet_address);

create table if not exists public.chat_one_time_prekeys (
  identity_id text not null
    references public.chat_key_bundles(identity_id) on delete cascade,
  opk_id integer not null,
  opk jsonb not null,
  requestor_id text,
  requestor_user_id text,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (identity_id, opk_id),
  constraint chat_one_time_prekeys_id_check
    check (opk_id >= 0),
  constraint chat_one_time_prekeys_payload_check
    check (jsonb_typeof(opk) = 'object'),
  constraint chat_one_time_prekeys_requestor_check
    check (
      (
        requestor_id is null
        and requestor_user_id is null
        and consumed_at is null
      )
      or (
        length(requestor_id) between 8 and 256
        and length(requestor_user_id) between 8 and 256
        and consumed_at >= created_at
      )
    )
);

create index if not exists chat_one_time_prekeys_available_idx
  on public.chat_one_time_prekeys (identity_id, opk_id)
  where consumed_at is null;
create unique index if not exists chat_one_time_prekeys_requestor_unique_idx
  on public.chat_one_time_prekeys (identity_id, requestor_user_id)
  where requestor_user_id is not null;

create table if not exists public.chat_mailbox_token_owners (
  mailbox_token text primary key,
  user_id text not null,
  wallet_address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_mailbox_token_owners_token_check
    check (
      (mailbox_token like 'smbx1.%' or mailbox_token like 'smbx2.%')
      and length(mailbox_token) between 14 and 256
      and mailbox_token !~ '[[:space:][:cntrl:]:]'
    ),
  constraint chat_mailbox_token_owners_wallet_check
    check (wallet_address ~ '^EXO00[0-9a-f]{38}$'),
  constraint chat_mailbox_token_owners_binding_fk
    foreign key (user_id, wallet_address)
    references public.auth_wallet_bindings(user_id, wallet_address)
    on delete cascade
);

create index if not exists chat_mailbox_token_owners_user_wallet_idx
  on public.chat_mailbox_token_owners (user_id, wallet_address, mailbox_token);

create table if not exists public.group_epoch_transitions (
  transition_id text primary key,
  group_id text not null,
  action text not null,
  actor_identity_id text not null,
  target_identity_ids jsonb not null,
  pre_member_identity_ids jsonb not null,
  post_member_identity_ids jsonb not null,
  roster_hash text not null,
  from_revision bigint not null,
  to_revision bigint not null,
  from_epoch bigint not null,
  to_epoch bigint not null,
  rotator_identity_id text,
  status text not null default 'pending',
  distribution_id text,
  package_recipient_ids jsonb,
  owner_user_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  activated_at timestamptz,
  constraint group_epoch_transitions_id_check
    check (transition_id ~ '^gep1[.][0-9a-f]{32}$'),
  constraint group_epoch_transitions_action_check
    check (action in ('add', 'remove', 'leave')),
  constraint group_epoch_transitions_array_check
    check (
      jsonb_typeof(target_identity_ids) = 'array'
      and jsonb_typeof(pre_member_identity_ids) = 'array'
      and jsonb_typeof(post_member_identity_ids) = 'array'
      and (package_recipient_ids is null or jsonb_typeof(package_recipient_ids) = 'array')
    ),
  constraint group_epoch_transitions_roster_hash_check
    check (roster_hash ~ '^[0-9a-f]{64}$'),
  constraint group_epoch_transitions_revision_check
    check (
      from_revision >= 1 and to_revision = from_revision + 1
      and from_epoch >= 1 and to_epoch = from_epoch + 1
    ),
  constraint group_epoch_transitions_status_check
    check (status in ('pending', 'activated', 'cancelled')),
  constraint group_epoch_transitions_owner_check
    check (length(owner_user_id) between 8 and 256),
  constraint group_epoch_transitions_time_check
    check (expires_at > created_at),
  constraint group_epoch_transitions_activation_check
    check (
      (
        status = 'activated'
        and activated_at is not null
        and (
          (
            jsonb_array_length(post_member_identity_ids) = 0
            and distribution_id is null
            and package_recipient_ids is null
          )
          or (
            distribution_id is not null
            and package_recipient_ids is not null
          )
        )
      )
      or (
        status <> 'activated'
        and activated_at is null
      )
    )
);

create unique index if not exists group_epoch_transitions_pending_group_idx
  on public.group_epoch_transitions (group_id)
  where status = 'pending';
create index if not exists group_epoch_transitions_rotator_status_idx
  on public.group_epoch_transitions (rotator_identity_id, status, created_at);
create index if not exists group_epoch_transitions_post_members_gin_idx
  on public.group_epoch_transitions using gin (post_member_identity_ids jsonb_ops);

drop trigger if exists mobile_app_records_set_updated_at on public.mobile_app_records;
create trigger mobile_app_records_set_updated_at
before update on public.mobile_app_records
for each row execute function spectra_private.set_updated_at();

drop trigger if exists chat_key_bundles_set_updated_at on public.chat_key_bundles;
create trigger chat_key_bundles_set_updated_at
before update on public.chat_key_bundles
for each row execute function spectra_private.set_updated_at();

drop trigger if exists chat_mailbox_token_owners_set_updated_at on public.chat_mailbox_token_owners;
create trigger chat_mailbox_token_owners_set_updated_at
before update on public.chat_mailbox_token_owners
for each row execute function spectra_private.set_updated_at();
