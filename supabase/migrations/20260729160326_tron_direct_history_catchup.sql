-- Keep direct Tron history catch-up bounded and independent.

do $cron$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname = 'spectra-wallet-backfill-tron'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'spectra-wallet-backfill-tron',
    '*/2 * * * *',
    $$select spectra_private.invoke_wallet_backfill_webhook('tron')$$
  );
end
$cron$;
