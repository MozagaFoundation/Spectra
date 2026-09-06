create table public.app_version_policies (
  platform text primary key,
  minimum_supported_version text not null,
  latest_version text not null,
  store_url text not null,
  block_unversioned_clients boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_version_policies_platform_check
    check (platform in ('ios', 'android')),
  constraint app_version_policies_minimum_version_check
    check (minimum_supported_version ~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'),
  constraint app_version_policies_latest_version_check
    check (latest_version ~ '^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$'),
  constraint app_version_policies_store_url_check
    check (
      (platform = 'ios' and store_url ~ '^https://apps[.]apple[.]com/[^[:space:]]+$')
      or (
        platform = 'android'
        and store_url ~ '^https://play[.]google[.]com/store/apps/details[?][^[:space:]]+$'
      )
    )
);

create trigger app_version_policies_set_updated_at
before update on public.app_version_policies
for each row execute function spectra_private.set_updated_at();

alter table public.app_version_policies enable row level security;
alter table public.app_version_policies force row level security;

revoke all on table public.app_version_policies from public, anon, authenticated;
grant select, insert, update, delete on table public.app_version_policies to service_role;
