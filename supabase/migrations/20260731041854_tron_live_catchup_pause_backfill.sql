-- Reserve the Tron transaction lock for rapid live catch-up.

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
end
$cron$;
