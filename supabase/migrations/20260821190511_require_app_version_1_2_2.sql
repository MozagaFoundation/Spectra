-- Require the current store release as the minimum supported client.
update public.app_version_policies
set
  minimum_supported_version = '1.2.2',
  latest_version = '1.2.2',
  updated_at = now()
where platform in ('ios', 'android');
