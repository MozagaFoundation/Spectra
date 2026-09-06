alter table public.auth_wallet_bindings
  add column if not exists identity_dilithium_key text;

alter table public.auth_wallet_bindings
  drop constraint if exists auth_wallet_bindings_identity_dilithium_key_check,
  add constraint auth_wallet_bindings_identity_dilithium_key_check
    check (
      identity_dilithium_key is null
      or identity_dilithium_key ~ '^0x[0-9a-fA-F]{3904}$'
    );

create table if not exists public.chat_account_deletion_tombstones (
  identity_id text primary key,
  recipient_mailbox_token_hash text not null,
  certificate_signature text not null,
  certificate_issued_at timestamptz not null,
  deleted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint chat_account_deletion_tombstones_identity_check
    check (
      length(identity_id) between 8 and 256
      and identity_id !~ '[[:space:]:[:cntrl:]]'
    ),
  constraint chat_account_deletion_tombstones_capability_check
    check (recipient_mailbox_token_hash ~ '^[0-9a-f]{64}$'),
  constraint chat_account_deletion_tombstones_signature_check
    check (certificate_signature ~ '^0x[0-9a-fA-F]{6618}$'),
  constraint chat_account_deletion_tombstones_expiry_check
    check (expires_at > deleted_at)
);

create index if not exists chat_account_deletion_tombstones_expiry_idx
  on public.chat_account_deletion_tombstones (expires_at);

alter table public.chat_account_deletion_tombstones enable row level security;
alter table public.chat_account_deletion_tombstones force row level security;

revoke all on table public.chat_account_deletion_tombstones
  from public, anon, authenticated;
grant select, insert, update, delete on table public.chat_account_deletion_tombstones
  to service_role;

create or replace function spectra_private.reject_deleted_relay_recipient()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if exists (
    select 1
    from public.chat_account_deletion_tombstones tombstones
    where tombstones.recipient_mailbox_token_hash = encode(
      extensions.digest(
        convert_to('spectra.account-deletion-tombstone-capability.v1', 'UTF8')
          || decode('00', 'hex')
          || convert_to(new.recipient_mailbox_token, 'UTF8'),
        'sha256'
      ),
      'hex'
    )
      and tombstones.expires_at > now()
  ) then
    raise exception using errcode = 'P0001', message = 'recipient_deleted';
  end if;
  return new;
end;
$$;

drop trigger if exists reject_deleted_relay_recipient
  on public.sealed_relay_messages;
create trigger reject_deleted_relay_recipient
before insert on public.sealed_relay_messages
for each row execute function spectra_private.reject_deleted_relay_recipient();

revoke all on function spectra_private.reject_deleted_relay_recipient()
  from public, anon, authenticated;

create or replace function spectra_private.purge_expired_account_deletion_tombstones(
  p_batch_size integer default 10000
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  if p_batch_size not between 1 and 50000 then
    raise exception using errcode = '22023', message = 'invalid retention batch size';
  end if;

  with victims as (
    select ctid
    from public.chat_account_deletion_tombstones
    where expires_at <= now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.chat_account_deletion_tombstones rows
  using victims
  where rows.ctid = victims.ctid;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function spectra_private.purge_expired_account_deletion_tombstones(integer)
  from public, anon, authenticated;
grant execute on function spectra_private.purge_expired_account_deletion_tombstones(integer)
  to service_role;

do $cron$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'spectra-account-deletion-tombstone-retention'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'spectra-account-deletion-tombstone-retention',
    '*/5 * * * *',
    'select spectra_private.purge_expired_account_deletion_tombstones(10000)'
  );
end
$cron$;
