-- Retire the stale retention routine after wallet-index schema replacement.

do $cron$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid
    from cron.job
    where jobname in ('spectra-retention', 'spectra-privacy-retention')
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'spectra-privacy-retention',
    '*/5 * * * *',
    'select spectra_private.run_privacy_retention_maintenance(10000)'
  );
end
$cron$;

drop function if exists spectra_private.run_retention_maintenance(integer);
