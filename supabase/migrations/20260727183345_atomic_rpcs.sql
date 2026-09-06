create or replace function spectra_private.increment_api_rate_limit(
  p_key_hash text,
  p_window_start timestamptz,
  p_expires_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$' or p_expires_at <= p_window_start then
    raise exception using errcode = '22023', message = 'invalid rate-limit input';
  end if;

  delete from public.api_rate_limits
  where key_hash = p_key_hash and expires_at <= p_window_start;

  insert into public.api_rate_limits (
    key_hash, window_start, request_count, expires_at
  ) values (
    p_key_hash, p_window_start, 1, p_expires_at
  )
  on conflict (key_hash, window_start) do update set
    request_count = public.api_rate_limits.request_count + 1,
    expires_at = greatest(public.api_rate_limits.expires_at, excluded.expires_at)
  returning request_count into v_count;

  return v_count;
end;
$$;

create or replace function spectra_private.consume_wallet_challenge(
  p_challenge text,
  p_user_id text,
  p_wallet_address text,
  p_public_key text,
  p_identity_id text default null
)
returns public.auth_wallet_bindings
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_verified_at timestamptz;
  v_binding public.auth_wallet_bindings;
  v_previous_user_id text;
begin
  delete from public.auth_wallet_challenges
  where challenge = p_challenge
    and user_id = p_user_id
    and wallet_address = p_wallet_address
    and consumed_at is null
    and expires_at > now()
  returning greatest(now(), created_at) into v_verified_at;

  if not found then
    return null;
  end if;

  select bindings.user_id
  into v_previous_user_id
  from public.auth_wallet_bindings bindings
  where bindings.wallet_address = p_wallet_address
  for update;

  if found and v_previous_user_id <> p_user_id then
    update public.auth_refresh_tokens
    set revoked_at = coalesce(revoked_at, v_verified_at)
    where wallet_address = p_wallet_address
      and revoked_at is null;
  end if;

  insert into public.auth_wallet_bindings (
    wallet_address,
    user_id,
    public_key,
    identity_id,
    verified_at,
    updated_at
  ) values (
    p_wallet_address,
    p_user_id,
    p_public_key,
    nullif(btrim(p_identity_id), ''),
    v_verified_at,
    v_verified_at
  )
  on conflict (wallet_address) do update set
    user_id = excluded.user_id,
    public_key = excluded.public_key,
    identity_id = excluded.identity_id,
    verified_at = excluded.verified_at,
    updated_at = excluded.updated_at
  returning * into v_binding;

  return v_binding;
end;
$$;

comment on function spectra_private.consume_wallet_challenge(text, text, text, text, text) is
  'Service-only: the caller must verify the wallet signature before consuming the challenge.';

create or replace function spectra_private.rotate_refresh_token(
  p_old_hash text,
  p_new_hash text,
  p_new_session_id text,
  p_rotated_at timestamptz,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old public.auth_refresh_tokens;
begin
  select *
  into v_old
  from public.auth_refresh_tokens
  where token_hash = p_old_hash
  for update;

  if not found
    or v_old.rotated_at is not null
    or v_old.revoked_at is not null
    or p_rotated_at >= v_old.expires_at
    or p_expires_at <= p_rotated_at
  then
    return false;
  end if;

  insert into public.auth_refresh_tokens (
    token_hash,
    session_id,
    user_id,
    wallet_address,
    identity_id,
    created_at,
    expires_at
  ) values (
    p_new_hash,
    p_new_session_id,
    v_old.user_id,
    v_old.wallet_address,
    v_old.identity_id,
    p_rotated_at,
    p_expires_at
  );

  update public.auth_refresh_tokens
  set rotated_at = p_rotated_at,
      replaced_by_token_hash = p_new_hash
  where token_hash = p_old_hash
    and rotated_at is null
    and revoked_at is null;

  return found;
end;
$$;

create or replace function spectra_private.claim_chat_one_time_prekey(
  p_requestor_user_id text,
  p_target_identity_id text,
  p_requestor_identity_id text
)
returns table (opk_id integer, opk jsonb)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id integer;
  v_opk jsonb;
begin
  if p_target_identity_id = p_requestor_identity_id then
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_target_identity_id || chr(31) || p_requestor_user_id, 0)
  );

  if not exists (
    select 1
    from public.chat_key_bundles bundles
    where bundles.identity_id = p_requestor_identity_id
      and bundles.owner_user_id = p_requestor_user_id
  ) then
    raise exception using errcode = '42501', message = 'requestor identity is not owned';
  end if;

  if exists (
    select 1
    from public.chat_one_time_prekeys keys
    where keys.identity_id = p_target_identity_id
      and keys.requestor_user_id = p_requestor_user_id
      and keys.consumed_at is not null
  ) then
    return;
  end if;

  select keys.opk_id, keys.opk
  into v_id, v_opk
  from public.chat_one_time_prekeys keys
  where keys.identity_id = p_target_identity_id
    and keys.consumed_at is null
  order by keys.opk_id
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.chat_one_time_prekeys keys
  set requestor_id = p_requestor_identity_id,
      requestor_user_id = p_requestor_user_id,
      consumed_at = now()
  where keys.identity_id = p_target_identity_id
    and keys.opk_id = v_id
    and keys.consumed_at is null;

  if not found then
    return;
  end if;

  return query select v_id, v_opk;
end;
$$;

create or replace function spectra_private.register_mailbox_tokens(
  p_user_id text,
  p_wallet_address text,
  p_mailbox_tokens text[]
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_expected integer;
  v_affected integer;
begin
  if p_mailbox_tokens is null or cardinality(p_mailbox_tokens) > 50 then
    raise exception using errcode = '22023', message = 'invalid mailbox token set';
  end if;

  if not exists (
    select 1
    from public.auth_wallet_bindings bindings
    where bindings.user_id = p_user_id
      and bindings.wallet_address = p_wallet_address
  ) or exists (
    select 1
    from public.mobile_spectre_addresses spectre
    where spectre.wallet_address = p_wallet_address
  ) then
    raise exception using errcode = '42501', message = 'wallet cannot register mailbox tokens';
  end if;

  with proposed as (
    select distinct btrim(token) as token
    from unnest(p_mailbox_tokens) token
  )
  select count(*) into v_expected from proposed;

  if exists (
    select 1
    from (
      select distinct btrim(token) as token
      from unnest(p_mailbox_tokens) token
    ) proposed
    where not (
      (proposed.token like 'smbx1.%' or proposed.token like 'smbx2.%')
      and length(proposed.token) between 14 and 256
      and proposed.token !~ '[[:space:][:cntrl:]:]'
    )
  ) then
    raise exception using errcode = '22023', message = 'invalid mailbox token';
  end if;

  insert into public.chat_mailbox_token_owners (
    mailbox_token, user_id, wallet_address, created_at, updated_at
  )
  select distinct btrim(token), p_user_id, p_wallet_address, now(), now()
  from unnest(p_mailbox_tokens) token
  on conflict (mailbox_token) do update set
    user_id = excluded.user_id,
    wallet_address = excluded.wallet_address,
    updated_at = excluded.updated_at
  where public.chat_mailbox_token_owners.user_id = excluded.user_id
    and public.chat_mailbox_token_owners.wallet_address = excluded.wallet_address;

  get diagnostics v_affected = row_count;
  if v_affected <> v_expected then
    raise exception using errcode = '23505', message = 'mailbox token already owned';
  end if;

  return v_affected;
end;
$$;

create or replace function spectra_private.store_sealed_relay_message(
  p_sender_user_id text,
  p_recipient_mailbox_token text,
  p_delivery_token text,
  p_delivery_class text,
  p_sealed_envelope jsonb,
  p_push_notification_enabled boolean default false,
  p_retention interval default interval '30 days'
)
returns table (
  message_id text,
  server_sequence bigint,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_message public.sealed_relay_messages;
  v_request_digest text;
begin
  if p_retention <= interval '0 seconds'
    or p_retention > interval '30 days'
  then
    raise exception using errcode = '22023', message = 'invalid relay request';
  end if;

  if p_delivery_token is not null then
    v_request_digest := encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'sender_user_id', p_sender_user_id,
            'recipient_mailbox_token', p_recipient_mailbox_token,
            'delivery_class', p_delivery_class,
            'sealed_envelope', p_sealed_envelope,
            'push_notification_enabled', coalesce(p_push_notification_enabled, false),
            'retention_seconds', extract(epoch from p_retention)
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    select *
    into v_message
    from public.sealed_relay_messages messages
    where messages.delivery_token = p_delivery_token;

    if found then
      if v_message.sender_user_id = p_sender_user_id
        and v_message.request_digest = v_request_digest
      then
        return query
          select
            v_message.message_id,
            v_message.server_sequence,
            v_message.status,
            v_message.created_at,
            v_message.expires_at,
            true;
        return;
      end if;
      raise exception using errcode = '23505', message = 'delivery token conflict';
    end if;
  end if;

  begin
    insert into public.sealed_relay_messages (
      sender_user_id,
      recipient_mailbox_token,
      delivery_token,
      request_digest,
      delivery_class,
      sealed_envelope,
      push_notification_enabled,
      expires_at
    ) values (
      p_sender_user_id,
      p_recipient_mailbox_token,
      p_delivery_token,
      v_request_digest,
      p_delivery_class,
      p_sealed_envelope,
      coalesce(p_push_notification_enabled, false),
      now() + p_retention
    )
    returning * into v_message;
  exception
    when unique_violation then
      if p_delivery_token is null then
        raise;
      end if;

      select *
      into v_message
      from public.sealed_relay_messages messages
      where messages.delivery_token = p_delivery_token;

      if not found
        or v_message.sender_user_id <> p_sender_user_id
        or v_message.request_digest <> v_request_digest
      then
        raise exception using errcode = '23505', message = 'delivery token conflict';
      end if;

      return query
        select
          v_message.message_id,
          v_message.server_sequence,
          v_message.status,
          v_message.created_at,
          v_message.expires_at,
          true;
      return;
  end;

  return query
    select
      v_message.message_id,
      v_message.server_sequence,
      v_message.status,
      v_message.created_at,
      v_message.expires_at,
      false;
end;
$$;

create or replace function spectra_private.advance_sealed_relay_status(
  p_user_id text,
  p_message_id text,
  p_status text,
  p_at timestamptz default now()
)
returns public.sealed_relay_messages
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_message public.sealed_relay_messages;
begin
  if p_status not in ('delivered', 'read') then
    raise exception using errcode = '22023', message = 'invalid relay status';
  end if;

  select messages.*
  into v_message
  from public.sealed_relay_messages messages
  join public.chat_mailbox_token_owners owners
    on owners.mailbox_token = messages.recipient_mailbox_token
  where messages.message_id = p_message_id
    and owners.user_id = p_user_id
  for update of messages;

  if not found then
    raise exception using errcode = '42501', message = 'relay message unavailable';
  end if;

  if p_status = 'delivered' and v_message.status = 'pending' then
    update public.sealed_relay_messages
    set status = 'delivered',
        delivered_at = greatest(p_at, created_at)
    where public.sealed_relay_messages.message_id = p_message_id
    returning * into v_message;
  elsif p_status = 'read' and v_message.status in ('pending', 'delivered') then
    update public.sealed_relay_messages
    set status = 'read',
        delivered_at = coalesce(delivered_at, greatest(p_at, created_at)),
        read_at = greatest(p_at, coalesce(delivered_at, created_at))
    where public.sealed_relay_messages.message_id = p_message_id
    returning * into v_message;
  end if;

  return v_message;
end;
$$;

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
    and owners.user_id = p_user_id;

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

create or replace function spectra_private.issue_ephemeral_spectre_ticket(
  p_wallet_address text,
  p_issued_at timestamptz default now()
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_next_available timestamptz;
begin
  perform 1
  from public.mobile_paid_root_addresses roots
  where roots.wallet_address = p_wallet_address
    and roots.status = 'active'
    and roots.billing_source = 'manual_entitlement'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'wallet is not entitled';
  end if;

  select issues.next_available_at
  into v_next_available
  from public.mobile_account_blind_token_issues issues
  where issues.wallet_address = p_wallet_address
    and issues.ticket_purpose = 'spectre_ephemeral'
    and issues.period_start = date '1970-01-01'
  for update;

  if found and v_next_available > p_issued_at then
    raise exception using errcode = 'P0001', message = 'ticket quota unavailable';
  end if;

  v_next_available := p_issued_at + interval '24 hours';

  insert into public.mobile_account_blind_token_issues (
    wallet_address,
    ticket_purpose,
    period_start,
    issued_count,
    last_issued_at,
    next_available_at,
    updated_at
  ) values (
    p_wallet_address,
    'spectre_ephemeral',
    date '1970-01-01',
    1,
    p_issued_at,
    v_next_available,
    p_issued_at
  )
  on conflict (wallet_address, ticket_purpose, period_start) do update set
    issued_count = 1,
    last_issued_at = excluded.last_issued_at,
    next_available_at = excluded.next_available_at,
    updated_at = excluded.updated_at;

  return v_next_available;
end;
$$;

create or replace function spectra_private.redeem_ephemeral_spectre_ticket(
  p_wallet_address text,
  p_nullifier_hash text,
  p_token_key_id text,
  p_redeemed_at timestamptz default now()
)
returns public.mobile_spectre_addresses
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_address public.mobile_spectre_addresses;
begin
  if exists (
    select 1
    from public.mobile_paid_root_addresses roots
    where roots.wallet_address = p_wallet_address
      and roots.status = 'active'
  ) or exists (
    select 1
    from public.mobile_spectre_addresses spectre
    where spectre.wallet_address = p_wallet_address
  ) then
    raise exception using errcode = '42501', message = 'wallet has conflicting account state';
  end if;

  insert into public.mobile_account_blind_token_redemptions (
    nullifier_hash,
    wallet_address,
    ticket_purpose,
    token_key_id,
    is_ephemeral,
    redeemed_at,
    updated_at
  ) values (
    p_nullifier_hash,
    p_wallet_address,
    'spectre_ephemeral',
    p_token_key_id,
    true,
    p_redeemed_at,
    p_redeemed_at
  );

  insert into public.mobile_spectre_addresses (
    wallet_address,
    is_ephemeral,
    activated_at,
    expires_at,
    updated_at
  ) values (
    p_wallet_address,
    true,
    p_redeemed_at,
    p_redeemed_at + interval '24 hours',
    p_redeemed_at
  )
  returning * into v_address;

  return v_address;
end;
$$;

create or replace function spectra_private.purge_relay_user(p_user_id text)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer := 0;
  v_step integer;
begin
  delete from public.sealed_relay_messages
  where sender_user_id = p_user_id;
  get diagnostics v_step = row_count;
  v_deleted := v_deleted + v_step;

  delete from public.chat_mailbox_token_owners
  where user_id = p_user_id;
  get diagnostics v_step = row_count;
  v_deleted := v_deleted + v_step;

  return v_deleted;
end;
$$;

create or replace function spectra_private.start_account_deletion(
  p_user_id text,
  p_operation_token_hash text default null,
  p_operation_token_expires_at timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, pgmq
as $$
declare
  v_generation bigint;
  v_object_count integer;
  v_identity_ids text[];
  v_wallet_addresses text[];
  v_deleted_actor text;
begin
  if length(btrim(p_user_id)) not between 8 and 256 then
    raise exception using errcode = '22023', message = 'invalid account deletion user';
  end if;

  select
    coalesce(
      array_agg(bindings.identity_id) filter (where bindings.identity_id is not null),
      array[]::text[]
    ),
    coalesce(array_agg(bindings.wallet_address), array[]::text[])
  into v_identity_ids, v_wallet_addresses
  from public.auth_wallet_bindings bindings
  where bindings.user_id = p_user_id;

  v_deleted_actor :=
    'deleted:' || encode(extensions.digest(p_user_id, 'sha256'), 'hex');

  insert into public.account_deletion_jobs (
    user_id,
    generation,
    status,
    requested_at,
    next_retry_at,
    operation_token_hash,
    operation_token_expires_at,
    updated_at
  ) values (
    p_user_id,
    1,
    'pending',
    now(),
    now(),
    p_operation_token_hash,
    p_operation_token_expires_at,
    now()
  )
  on conflict (user_id) do update set
    generation = public.account_deletion_jobs.generation + 1,
    status = 'pending',
    requested_at = now(),
    postgres_deleted_at = null,
    objects_deleted_at = null,
    relay_deleted_at = null,
    completed_at = null,
    attempt_count = 0,
    last_error = null,
    next_retry_at = now(),
    operation_token_hash = excluded.operation_token_hash,
    operation_token_expires_at = excluded.operation_token_expires_at,
    updated_at = now()
  returning generation into v_generation;

  select count(*)
  into v_object_count
  from public.object_records
  where owner_user_id = p_user_id
    and lifecycle <> 'deleted';

  update public.object_records
  set lifecycle = 'deletion_pending',
      deleted_at = coalesce(deleted_at, now()),
      cleanup_queued_at = coalesce(cleanup_queued_at, now())
  where owner_user_id = p_user_id
    and lifecycle in ('pending', 'active', 'expired');

  perform spectra_private.purge_relay_user(p_user_id);

  delete from public.mobile_spectre_addresses
  where wallet_address = any(v_wallet_addresses);
  delete from public.mobile_account_blind_token_redemptions
  where wallet_address = any(v_wallet_addresses);
  delete from public.mobile_paid_root_addresses
  where wallet_address = any(v_wallet_addresses);
  delete from public.mobile_spectre_backup_audit_events where user_id = p_user_id;
  delete from public.mobile_spectre_backup_manifests where user_id = p_user_id;

  delete from public.group_epoch_transitions transitions
  where transitions.owner_user_id = p_user_id
    or transitions.actor_identity_id = any(v_identity_ids)
    or transitions.rotator_identity_id = any(v_identity_ids)
    or transitions.target_identity_ids ?| v_identity_ids
    or transitions.pre_member_identity_ids ?| v_identity_ids
    or transitions.post_member_identity_ids ?| v_identity_ids
    or coalesce(transitions.package_recipient_ids, '[]'::jsonb) ?| v_identity_ids;

  delete from public.chat_key_bundles where owner_user_id = p_user_id;

  update public.support_access_audit_events
  set actor_user_id = v_deleted_actor
  where actor_user_id = p_user_id;
  delete from public.support_ticket_assignments
  where staff_user_id = p_user_id or assigned_by_user_id = p_user_id;
  delete from public.support_staff_roles where user_id = p_user_id;
  update public.support_tickets
  set status = 'deleted',
      description = '[deleted by owner]',
      user_address = '[deleted]'
  where owner_user_id = p_user_id;

  delete from public.mobile_app_records records
  where records.owner_user_id = p_user_id
    or records.body->>'user_id' = p_user_id
    or records.body->>'owner_user_id' = p_user_id
    or records.body->>'wallet_address' = any(v_wallet_addresses)
    or records.body->>'user_address' = any(v_wallet_addresses)
    or records.body->>'identity_id' = any(v_identity_ids)
    or records.body->>'owner_identity_id' = any(v_identity_ids)
    or records.body->>'user_identity_id' = any(v_identity_ids)
    or records.body->>'sender_identity_id' = any(v_identity_ids)
    or (
      records.record_table <> 'chat_group_messages'
      and records.body->>'recipient_identity_id' = any(v_identity_ids)
    );
  delete from public.wallet_index_user_addresses where user_id = p_user_id;
  delete from public.wallet_index_addresses addresses
  where not exists (
    select 1
    from public.wallet_index_user_addresses users
    where users.address_hash = addresses.address_hash
  );
  delete from public.auth_wallet_challenges where user_id = p_user_id;
  delete from public.auth_refresh_tokens where user_id = p_user_id;
  delete from public.auth_wallet_bindings where user_id = p_user_id;

  if v_object_count = 0 then
    delete from public.support_tickets where owner_user_id = p_user_id;
    delete from public.object_records
    where owner_user_id = p_user_id and lifecycle = 'deleted';
  end if;

  update public.account_deletion_jobs
  set postgres_deleted_at = now(),
      relay_deleted_at = now(),
      objects_deleted_at = case when v_object_count = 0 then now() else null end,
      status = case when v_object_count = 0 then 'completed' else 'pending' end,
      completed_at = case when v_object_count = 0 then now() else null end,
      last_error = null,
      next_retry_at = now()
  where user_id = p_user_id and generation = v_generation;

  if v_object_count > 0 then
    perform pgmq.send(
      'account_cleanup',
      jsonb_build_object('user_id', p_user_id, 'generation', v_generation)
    );
  end if;

  return v_generation;
end;
$$;

create or replace function spectra_private.complete_object_cleanup(
  p_object_ref text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.object_records
  set lifecycle = 'deleted',
      deleted_at = coalesce(deleted_at, now()),
      storage_deleted_at = coalesce(storage_deleted_at, now())
  where object_ref = p_object_ref
    and lifecycle in ('deletion_pending', 'expired');

  return found;
end;
$$;

comment on function spectra_private.complete_object_cleanup(text) is
  'Service-only: call only after the worker confirms the Storage object is absent.';

create or replace function spectra_private.complete_account_object_cleanup(
  p_user_id text,
  p_generation bigint
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
    from public.object_records
    where owner_user_id = p_user_id
      and lifecycle <> 'deleted'
  ) then
    return false;
  end if;

  delete from public.support_tickets
  where owner_user_id = p_user_id;

  delete from public.object_records
  where owner_user_id = p_user_id
    and lifecycle = 'deleted';

  update public.account_deletion_jobs
  set objects_deleted_at = coalesce(objects_deleted_at, now()),
      status = 'completed',
      completed_at = coalesce(completed_at, now()),
      last_error = null,
      next_retry_at = now()
  where user_id = p_user_id
    and generation = p_generation
    and postgres_deleted_at is not null
    and relay_deleted_at is not null
    and status in ('pending', 'failed');

  return found;
end;
$$;

revoke all on all functions in schema spectra_private
  from public, anon, authenticated;

grant usage on schema spectra_private to service_role;
grant execute on all functions in schema spectra_private to service_role;
