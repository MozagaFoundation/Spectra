begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(12);

select results_eq(
  $$
    select count(*)::bigint
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relkind in ('r', 'p')
      and not relrowsecurity
  $$,
  array[0::bigint],
  'every public application table has RLS enabled'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relkind in ('r', 'p')
      and not relforcerowsecurity
  $$,
  array[0::bigint],
  'every public application table forces RLS'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_class tables
    cross join (values ('anon'), ('authenticated')) roles(name)
    where tables.relnamespace = 'public'::regnamespace
      and tables.relkind in ('r', 'p')
      and has_table_privilege(roles.name, tables.oid, 'SELECT,INSERT,UPDATE,DELETE')
  $$,
  array[0::bigint],
  'custom-auth clients have no direct table privileges'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_policies
    where schemaname = 'public'
      and roles && array['anon', 'authenticated']::name[]
      and (
        cmd <> 'ALL'
        or coalesce(qual, '') <> 'false'
        or coalesce(with_check, '') <> 'false'
      )
  $$,
  array[0::bigint],
  'client-targeted public-table policies remain deny-only'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_proc functions
    cross join (values ('anon'), ('authenticated')) roles(name)
    where functions.pronamespace = 'spectra_private'::regnamespace
      and has_function_privilege(roles.name, functions.oid, 'EXECUTE')
  $$,
  array[0::bigint],
  'private functions are not executable by client roles'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and roles && array['anon', 'authenticated']::name[]
  $$,
  array[0::bigint],
  'storage remains accessible only through signed service operations'
);

select results_eq(
  $$
    select count(*)::bigint
    from storage.buckets
    where id = 'objects'
      and not public
      and file_size_limit = 52428800
  $$,
  array[1::bigint],
  'the encrypted object bucket is private and bounded'
);

select results_eq(
  $$ select count(*)::bigint from pgmq.list_queues() where queue_name in (
    'account_cleanup',
    'object_cleanup',
    'relay_notifications'
  ) $$,
  array[3::bigint],
  'maintenance and relay queues are present'
);

select results_eq(
  $$
    select jobname
    from cron.job
    where jobname in (
    'spectra-privacy-retention',
    'spectra-janitor-worker',
    'spectra-market-worker',
    'spectra-notification-worker',
    'spectra-wallet-live-bitcoin',
    'spectra-wallet-live-ethereum',
    'spectra-wallet-live-mozaga',
    'spectra-wallet-live-solana',
    'spectra-wallet-live-tron'
    )
    order by jobname
  $$,
  array[
    'spectra-janitor-worker',
    'spectra-market-worker',
    'spectra-notification-worker',
    'spectra-privacy-retention',
    'spectra-wallet-live-bitcoin',
    'spectra-wallet-live-ethereum',
    'spectra-wallet-live-mozaga',
    'spectra-wallet-live-solana',
    'spectra-wallet-live-tron'
  ]::text[],
  'core retention and live-worker schedules are present'
);

select ok(
  has_table_privilege('service_role', 'public.object_records', 'SELECT,INSERT,UPDATE,DELETE'),
  'the Edge service role can access application tables'
);

select ok(
  has_function_privilege(
    'service_role',
    'spectra_private.invoke_worker_webhook(text)',
    'EXECUTE'
  ),
  'the Edge service role can invoke allowlisted workers'
);

select is(
  to_regprocedure('spectra_private.invoke_maintenance_webhook()'),
  null,
  'the obsolete maintenance webhook is removed'
);

select * from finish();
rollback;
