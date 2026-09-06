create or replace function spectra_private.enqueue_call_session_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pgmq, extensions
as $$
declare
  v_state text := new.body->>'state';
  v_previous_state text := case
    when tg_op = 'UPDATE' then old.body->>'state'
    else null
  end;
begin
  if new.record_table <> 'call_sessions' then
    return new;
  end if;

  if (
    (tg_op = 'INSERT' and v_state = 'initiating')
    or (
      tg_op = 'UPDATE'
      and v_state in ('ended', 'failed')
      and v_state is distinct from v_previous_state
    )
  ) and spectra_private.enqueue_call_session_notification(new.body) then
    perform spectra_private.invoke_worker_webhook('notification-worker');
  end if;

  return new;
end;
$$;

drop trigger if exists spectra_call_session_notification_outbox
  on public.mobile_app_records;

create trigger spectra_call_session_notification_outbox
after insert or update of body on public.mobile_app_records
for each row
execute function spectra_private.enqueue_call_session_change();

revoke all on function spectra_private.enqueue_call_session_change()
  from public, anon, authenticated;
grant execute on function spectra_private.enqueue_call_session_change()
  to service_role;
