-- Agora plaza voice notes: public m4a clips, counted toward the per-room line cap.

alter table public.agora_messages
  add column if not exists media_duration_ms integer;

alter table public.agora_messages
  drop constraint if exists agora_messages_media_check;

alter table public.agora_messages
  add constraint agora_messages_media_check
  check (
    (
      media_kind is null
      and media_path is null
      and media_bytes is null
      and media_duration_ms is null
    )
    or (
      media_kind = 'image'
      and media_path ~ '^ago1[.][a-z][a-z0-9_]{1,24}[.][0-9]{1,2}/agm1[.][0-9a-f]{32}[.](jpg|png|webp|gif)$'
      and media_bytes between 1 and 6291456
      and media_duration_ms is null
    )
    or (
      media_kind = 'voice'
      and media_path ~ '^ago1[.][a-z][a-z0-9_]{1,24}[.][0-9]{1,2}/agm1[.][0-9a-f]{32}[.]m4a$'
      and media_bytes between 1 and 2097152
      and media_duration_ms between 1 and 60000
    )
  );

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/mp4',
  'audio/m4a',
  'audio/aac'
]
where id = 'agora-media';
