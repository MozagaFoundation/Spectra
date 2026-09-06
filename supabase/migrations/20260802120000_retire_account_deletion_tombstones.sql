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
end
$cron$;

drop trigger if exists reject_deleted_relay_recipient
  on public.sealed_relay_messages;
drop function if exists spectra_private.reject_deleted_relay_recipient();
drop function if exists spectra_private.purge_expired_account_deletion_tombstones(integer);
drop table if exists public.chat_account_deletion_tombstones;

alter table public.auth_wallet_bindings
  drop column if exists identity_dilithium_key;
