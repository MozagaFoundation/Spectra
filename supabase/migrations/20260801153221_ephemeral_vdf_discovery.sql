alter table public.chat_key_bundles
  add column if not exists public_expires_at timestamptz;

-- The new model never retains an unleased public bundle.
delete from public.chat_key_bundles
where public_expires_at is null;

alter table public.chat_key_bundles
  alter column public_expires_at set not null;

alter table public.chat_key_bundles
  drop constraint if exists chat_key_bundles_public_expiry_check;

alter table public.chat_key_bundles
  add constraint chat_key_bundles_public_expiry_check
  check (
    public_expires_at > created_at
    and public_expires_at <= created_at + interval '10 minutes'
  );

create index if not exists chat_key_bundles_public_expiry_idx
  on public.chat_key_bundles (public_expires_at);

create table if not exists public.chat_vdf_challenges (
  challenge_id text primary key,
  owner_user_id text not null,
  wallet_address text not null,
  action text not null,
  binding_hash text not null,
  nonce_hex text not null,
  parameter_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint chat_vdf_challenges_id_check
    check (challenge_id ~ '^vdfc1[.][0-9a-f]{32,128}$'),
  constraint chat_vdf_challenges_owner_check
    check (length(owner_user_id) between 8 and 256),
  constraint chat_vdf_challenges_wallet_check
    check (wallet_address ~ '^EXO00[0-9a-f]{38}$'),
  constraint chat_vdf_challenges_action_check
    check (action in ('wallet_admission', 'public_discovery', 'contact_card')),
  constraint chat_vdf_challenges_binding_check
    check (binding_hash ~ '^[0-9a-f]{64}$'),
  constraint chat_vdf_challenges_nonce_check
    check (nonce_hex ~ '^[0-9a-f]{64}$'),
  constraint chat_vdf_challenges_parameter_check
    check (parameter_id ~ '^[A-Za-z0-9_.-]{1,64}$'),
  constraint chat_vdf_challenges_time_check
    check (
      expires_at > created_at
      and expires_at <= created_at + interval '10 minutes'
      and (consumed_at is null or consumed_at >= created_at)
    )
);

create index if not exists chat_vdf_challenges_expiry_idx
  on public.chat_vdf_challenges (expires_at);

create index if not exists chat_vdf_challenges_owner_idx
  on public.chat_vdf_challenges (owner_user_id, wallet_address, created_at desc);

create table if not exists public.chat_one_time_contact_cards (
  card_id text primary key,
  capability_hash text not null unique,
  identity_id text not null,
  recipient_mailbox_token text not null,
  bundle jsonb not null,
  allocated_opk jsonb not null,
  owner_user_id text not null,
  wallet_address text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  constraint chat_one_time_contact_cards_id_check
    check (card_id ~ '^scc1[.][0-9a-f]{32}$'),
  constraint chat_one_time_contact_cards_capability_check
    check (capability_hash ~ '^[0-9a-f]{64}$'),
  constraint chat_one_time_contact_cards_identity_check
    check (length(identity_id) between 8 and 256),
  constraint chat_one_time_contact_cards_mailbox_check
    check (
      (recipient_mailbox_token like 'smbx1.%' or recipient_mailbox_token like 'smbx2.%')
      and length(recipient_mailbox_token) between 22 and 256
      and recipient_mailbox_token !~ '[[:space:][:cntrl:]:]'
    ),
  constraint chat_one_time_contact_cards_bundle_check
    check (jsonb_typeof(bundle) = 'object' and jsonb_typeof(allocated_opk) = 'object'),
  constraint chat_one_time_contact_cards_wallet_check
    check (wallet_address ~ '^EXO00[0-9a-f]{38}$'),
  constraint chat_one_time_contact_cards_redeemer_check
    check (redeemed_at is null or redeemed_at >= created_at),
  constraint chat_one_time_contact_cards_time_check
    check (
      expires_at > created_at
      and expires_at <= created_at + interval '1 hour'
      and (redeemed_at is null or redeemed_at < expires_at)
    ),
  constraint chat_one_time_contact_cards_owner_fk
    foreign key (owner_user_id, wallet_address)
    references public.auth_wallet_bindings(user_id, wallet_address)
    on delete cascade
);

create index if not exists chat_one_time_contact_cards_expiry_idx
  on public.chat_one_time_contact_cards (expires_at)
  where redeemed_at is null;

create index if not exists chat_one_time_contact_cards_owner_idx
  on public.chat_one_time_contact_cards (owner_user_id, created_at desc);

alter table public.chat_vdf_challenges enable row level security;
alter table public.chat_vdf_challenges force row level security;
alter table public.chat_one_time_contact_cards enable row level security;
alter table public.chat_one_time_contact_cards force row level security;

revoke all on public.chat_vdf_challenges, public.chat_one_time_contact_cards
  from public, anon, authenticated;
grant all on public.chat_vdf_challenges, public.chat_one_time_contact_cards to service_role;

create or replace function spectra_private.purge_ephemeral_chat_discovery(
  p_batch_size integer default 10000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
  v_result jsonb := '{}'::jsonb;
begin
  if p_batch_size not between 1 and 50000 then
    raise exception using errcode = '22023', message = 'invalid retention batch size';
  end if;

  with victims as (
    select ctid
    from public.chat_vdf_challenges
    where expires_at <= now()
      or consumed_at < now() - interval '1 hour'
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.chat_vdf_challenges rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('vdf_challenges', v_count);

  with victims as (
    select ctid
    from public.chat_one_time_contact_cards
    where expires_at <= now()
      or redeemed_at is not null
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.chat_one_time_contact_cards rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('contact_cards', v_count);

  with victims as (
    select ctid
    from public.chat_key_bundles
    where public_expires_at <= now()
    order by public_expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.chat_key_bundles rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  v_result := v_result || jsonb_build_object('public_bundles', v_count);

  return v_result;
end;
$$;

revoke all on function spectra_private.purge_ephemeral_chat_discovery(integer)
  from public, anon, authenticated;
grant execute on function spectra_private.purge_ephemeral_chat_discovery(integer)
  to service_role;

do $cron$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'spectra-ephemeral-chat-discovery'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'spectra-ephemeral-chat-discovery',
    '* * * * *',
    'select spectra_private.purge_ephemeral_chat_discovery(10000)'
  );
end
$cron$;
