alter table public.chat_key_bundles
  add column if not exists discovery_alias text,
  add column if not exists discovery_alias_key text,
  add column if not exists alias_autocomplete boolean not null default true;

alter table public.chat_key_bundles
  drop constraint if exists chat_key_bundles_discovery_alias_check;

alter table public.chat_key_bundles
  add constraint chat_key_bundles_discovery_alias_check
  check (
    discovery_alias is null
    or (
      char_length(discovery_alias) between 3 and 80
      and octet_length(discovery_alias) between 4 and 320
      and discovery_alias like '@%'
      and position('@' in substr(discovery_alias, 2)) = 0
      and discovery_alias !~ '[[:space:][:cntrl:]]'
    )
  );

alter table public.chat_key_bundles
  drop constraint if exists chat_key_bundles_discovery_alias_key_check;

alter table public.chat_key_bundles
  add constraint chat_key_bundles_discovery_alias_key_check
  check (
    (discovery_alias is null and discovery_alias_key is null)
    or (
      discovery_alias is not null
      and discovery_alias_key is not null
      and char_length(discovery_alias_key) between 3 and 80
      and octet_length(discovery_alias_key) between 4 and 320
      and discovery_alias_key like '@%'
    )
  );

create index if not exists chat_key_bundles_discovery_alias_live_idx
  on public.chat_key_bundles (discovery_alias_key)
  where discovery_alias_key is not null
    and discoverable_by_address = true;
