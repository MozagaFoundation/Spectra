-- Recipient cleanup may drop delivered rows after local projection or tombstone.
-- Pending rows stay until delivery is acknowledged so early cleanup cannot hide mail.
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
  v_remaining integer;
begin
  if p_message_ids is null or cardinality(p_message_ids) > 100 then
    raise exception using errcode = '22023', message = 'invalid relay delete set';
  end if;

  select count(distinct id)
  into v_requested
  from unnest(p_message_ids) id
  where length(btrim(id)) between 1 and 200;

  if v_requested = 0 then
    return 0;
  end if;

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
    and messages.status in ('delivered', 'read')
    and exists (
      select 1
      from public.chat_mailbox_token_owners owners
      where owners.mailbox_token = messages.recipient_mailbox_token
        and owners.user_id = p_user_id
    );

  select count(*)
  into v_remaining
  from public.sealed_relay_messages messages
  where messages.message_id in (
    select distinct btrim(id) from unnest(p_message_ids) id
  );

  return v_requested - v_remaining;
end;
$$;
