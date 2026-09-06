-- Keep 1.2.3 compatible while advertising this release.
update public.app_version_policies
set
  minimum_supported_version = '1.2.3',
  latest_version = '1.2.4',
  updated_at = now()
where platform in ('ios', 'android');
