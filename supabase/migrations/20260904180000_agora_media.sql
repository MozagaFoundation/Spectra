-- Agora plaza images: public, unencrypted, counted toward the per-room line cap.

alter table public.agora_messages
  add column if not exists media_kind text,
  add column if not exists media_path text,
  add column if not exists media_bytes integer;

alter table public.agora_messages
  drop constraint if exists agora_messages_body_check;

alter table public.agora_messages
  add constraint agora_messages_body_check
  check (
    char_length(body) <= 500
    and (
      char_length(body) >= 1
      or media_kind is not null
    )
  );

alter table public.agora_messages
  drop constraint if exists agora_messages_media_check;

alter table public.agora_messages
  add constraint agora_messages_media_check
  check (
    (
      media_kind is null
      and media_path is null
      and media_bytes is null
    )
    or (
      media_kind = 'image'
      and media_path ~ '^ago1[.][a-z][a-z0-9_]{1,24}[.][0-9]{1,2}/agm1[.][0-9a-f]{32}[.](jpg|png|webp|gif)$'
      and media_bytes between 1 and 6291456
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agora-media',
  'agora-media',
  true,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists agora_media_public_read on storage.objects;
create policy agora_media_public_read
  on storage.objects
  for select
  using (bucket_id = 'agora-media');
