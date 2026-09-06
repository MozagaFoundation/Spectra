-- Keep 1.2.3 compatible and advertise 1.2.4 as the latest supported release.
update public.app_version_policies
set
  minimum_supported_version = '1.2.3',
  latest_version = '1.2.4',
  updated_at = now()
where platform in ('ios', 'android');
