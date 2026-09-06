-- Drop delivered/read rows at or below the client's mailbox cursor without
-- re-downloading sealed blobs. Pending rows stay so undelivered mail is not wiped.
create or replace function spectra_private.vacuum_sealed_relay_messages(
  p_user_id text,
  p_before_sequence bigint,
  p_statuses text[] default array['read']::text[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer := 0;
begin
  if p_user_id is null or length(btrim(p_user_id)) = 0 then
    raise exception using errcode = '22023', message = 'invalid relay vacuum principal';
  end if;

  if p_before_sequence is null or p_before_sequence <= 0 then
    return 0;
  end if;

  if p_statuses is null or cardinality(p_statuses) = 0 then
    return 0;
  end if;

  if exists (
    select 1
    from unnest(p_statuses) status
    where status not in ('delivered', 'read')
  ) then
    raise exception using errcode = '22023', message = 'invalid relay vacuum status';
  end if;

  delete from public.sealed_relay_messages messages
  where messages.server_sequence > 0
    and messages.server_sequence <= p_before_sequence
    and messages.delivery_class = 'message'
    and messages.status = any(p_statuses)
    and exists (
      select 1
      from public.chat_mailbox_token_owners owners
      where owners.mailbox_token = messages.recipient_mailbox_token
        and owners.user_id = p_user_id
    );

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function spectra_private.vacuum_sealed_relay_messages(text, bigint, text[])
  from public, anon, authenticated;
grant execute on function spectra_private.vacuum_sealed_relay_messages(text, bigint, text[])
  to service_role;
