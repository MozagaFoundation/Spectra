create or replace function spectra_private.expire_stale_call_sessions(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pgmq, extensions
as $$
declare
  v_count integer := 0;
begin
  if p_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'invalid call expiry limit';
  end if;

  with victims as (
    select ctid
    from public.mobile_app_records
    where record_table = 'call_sessions'
      and coalesce(body->>'state', '') in (
        'initiating',
        'ringing',
        'connecting',
        'connected',
        'reconnecting'
      )
      and updated_at <= now() - case
        when body->>'state' = 'connected' then interval '5 minutes'
        else interval '90 seconds'
      end
    order by updated_at
    limit p_limit
    for update skip locked
  ),
  updated as (
    update public.mobile_app_records rows
    set body = rows.body || jsonb_build_object(
          'state', 'failed',
          'end_reason', case
            when rows.body->>'state' = 'connected' then 'network_error'
            else 'timeout'
          end,
          'ended_at', now(),
          'updated_at', now()
        ),
        updated_at = now()
    from victims
    where rows.ctid = victims.ctid
    returning 1
  )
  select count(*)::integer into v_count
  from updated;

  return v_count;
end;
$$;
