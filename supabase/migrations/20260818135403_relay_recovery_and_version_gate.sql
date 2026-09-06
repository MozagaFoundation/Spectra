-- Keep a relay row available until the recipient explicitly marks it read.
-- Client-side deletion is additionally guarded by a durable local projection,
-- but the server must not turn an early cleanup request into message loss.
create or replace function spectra_private.delete_sealed_relay_messages(
  p_user_id text,
  p_message_ids text[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_requested integer;
  v_authorized integer;
  v_deleted integer;
begin
  if p_message_ids is null or cardinality(p_message_ids) > 100 then
    raise exception using errcode = '22023', message = 'invalid relay delete set';
  end if;

  select count(distinct id)
  into v_requested
  from unnest(p_message_ids) id
  where length(btrim(id)) between 1 and 200;

  select count(*)
  into v_authorized
  from public.sealed_relay_messages messages
  join public.chat_mailbox_token_owners owners
    on owners.mailbox_token = messages.recipient_mailbox_token
  where messages.message_id in (
    select distinct btrim(id) from unnest(p_message_ids) id
  )
    and owners.user_id = p_user_id
    and messages.status = 'read';

  if exists (
    select 1
    from public.sealed_relay_messages messages
    where messages.message_id in (
      select distinct btrim(id) from unnest(p_message_ids) id
    )
      and not exists (
        select 1
        from public.chat_mailbox_token_owners owners
        where owners.mailbox_token = messages.recipient_mailbox_token
          and owners.user_id = p_user_id
      )
  ) then
    raise exception using errcode = '42501', message = 'relay message unavailable';
  end if;

  delete from public.sealed_relay_messages messages
  where messages.message_id in (
    select distinct btrim(id) from unnest(p_message_ids) id
  )
    and messages.status = 'read'
    and exists (
      select 1
      from public.chat_mailbox_token_owners owners
      where owners.mailbox_token = messages.recipient_mailbox_token
        and owners.user_id = p_user_id
    );

  get diagnostics v_deleted = row_count;
  return least(v_deleted, v_authorized, v_requested);
end;
$$;

-- Equal minimum/latest bounds intentionally enable the emergency exact-release
-- lock in appVersionPolicy: protected routes accept only version 1.2.1 until
-- this policy is advanced with a future approved release.
alter table public.app_version_policies
  drop constraint if exists app_version_policies_store_url_check;
alter table public.app_version_policies
  add constraint app_version_policies_store_url_check
  check (
    (platform = 'ios' and store_url ~ '^https://apps[.]apple[.]com/[^[:space:]]+$')
    or (
      platform = 'android'
      and (
        store_url ~ '^https://play[.]google[.]com/store/apps/details[?][^[:space:]]+$'
        or store_url ~ '^https://spectraprotocol[.]org/?$'
      )
    )
  );

insert into public.app_version_policies (
  platform,
  minimum_supported_version,
  latest_version,
  store_url,
  block_unversioned_clients
) values
  (
    'ios',
    '1.2.1',
    '1.2.1',
    'https://apps.apple.com/us/app/spectra-protocol/id6776937247',
    true
  ),
  (
    'android',
    '1.2.1',
    '1.2.1',
    'https://spectraprotocol.org',
    true
  )
on conflict (platform) do update set
  minimum_supported_version = excluded.minimum_supported_version,
  latest_version = excluded.latest_version,
  store_url = excluded.store_url,
  block_unversioned_clients = excluded.block_unversioned_clients,
  updated_at = now();
