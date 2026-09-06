-- Keep the previous release compatible while advertising this release.
update public.app_version_policies
set
  minimum_supported_version = '1.2.1',
  latest_version = '1.2.2',
  updated_at = now()
where platform in ('ios', 'android');
