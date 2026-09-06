alter table public.chat_key_bundles
  add column if not exists discoverable_by_address boolean not null default false;
