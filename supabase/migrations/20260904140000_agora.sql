-- Agora is a public plaintext plaza, isolated from sealed relay / E2E chat.

create table if not exists public.agora_rooms (
  id text primary key,
  topic_id text not null,
  instance_index integer not null,
  title text not null,
  topic_line text not null default '',
  icon text not null,
  is_canonical boolean not null default false,
  allows_overflow boolean not null default true,
  read_only boolean not null default false,
  sort_order integer not null,
  closing_at timestamptz,
  created_at timestamptz not null default now(),
  constraint agora_rooms_id_check
    check (id ~ '^ago1[.][a-z][a-z0-9_]{1,24}[.][0-9]{1,2}$'),
  constraint agora_rooms_topic_check
    check (topic_id ~ '^[a-z][a-z0-9_]{1,24}$'),
  constraint agora_rooms_instance_check
    check (instance_index between 1 and 20),
  constraint agora_rooms_title_check
    check (char_length(title) between 1 and 48),
  constraint agora_rooms_topic_line_check
    check (char_length(topic_line) <= 140),
  constraint agora_rooms_icon_check
    check (icon ~ '^[a-z][a-z0-9_]{1,24}$'),
  constraint agora_rooms_canonical_check
    check (
      (is_canonical and instance_index = 1 and closing_at is null)
      or (not is_canonical and instance_index >= 2)
    ),
  unique (topic_id, instance_index)
);

create table if not exists public.agora_identities (
  identity_id text primary key,
  owner_user_id text not null,
  nick text not null,
  nick_key text not null unique,
  color text not null,
  accepted_terms_version text not null,
  accepted_terms_at timestamptz not null,
  nick_changed_at timestamptz not null default now(),
  last_send_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agora_identities_id_check
    check (length(identity_id) between 8 and 256),
  constraint agora_identities_owner_check
    check (length(owner_user_id) between 8 and 256),
  constraint agora_identities_nick_check
    check (nick ~ '^[A-Za-z0-9_]{3,24}$'),
  constraint agora_identities_nick_key_check
    check (nick_key = lower(nick)),
  constraint agora_identities_color_check
    check (color in (
      'mint', 'gold', 'coral', 'sky', 'violet', 'rose',
      'amber', 'teal', 'lime', 'indigo', 'peach', 'slate'
    )),
  constraint agora_identities_terms_check
    check (char_length(accepted_terms_version) between 8 and 32)
);

create table if not exists public.agora_nick_tombstones (
  nick_key text primary key,
  identity_id text not null,
  expires_at timestamptz not null,
  constraint agora_nick_tombstones_key_check
    check (nick_key ~ '^[a-z0-9_]{3,24}$')
);

create table if not exists public.agora_messages (
  id text primary key,
  room_id text not null references public.agora_rooms(id) on delete cascade,
  author_id text not null references public.agora_identities(identity_id),
  body text not null,
  is_action boolean not null default false,
  server_sequence bigint generated always as identity,
  created_at timestamptz not null default now(),
  constraint agora_messages_id_check
    check (id ~ '^agm1[.][0-9a-f]{32}$'),
  constraint agora_messages_body_check
    check (char_length(body) between 1 and 500)
);

create table if not exists public.agora_whispers (
  id text primary key,
  room_id text not null references public.agora_rooms(id) on delete cascade,
  from_id text not null references public.agora_identities(identity_id),
  to_id text not null references public.agora_identities(identity_id),
  kind text not null default 'text',
  body text not null default '',
  invite_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint agora_whispers_id_check
    check (id ~ '^agw1[.][0-9a-f]{32}$'),
  constraint agora_whispers_kind_check
    check (kind in ('text', 'invite', 'invite_accept')),
  constraint agora_whispers_body_check
    check (char_length(body) <= 500),
  constraint agora_whispers_parties_check
    check (from_id <> to_id)
);

create table if not exists public.agora_invites (
  id text primary key,
  room_id text not null references public.agora_rooms(id) on delete cascade,
  from_id text not null references public.agora_identities(identity_id),
  to_id text not null references public.agora_identities(identity_id),
  contact_invite text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  constraint agora_invites_id_check
    check (id ~ '^agi1[.][0-9a-f]{32}$'),
  constraint agora_invites_payload_check
    check (
      contact_invite like 'spectra:contact-card:v1:%'
      and char_length(contact_invite) between 40 and 512
    ),
  constraint agora_invites_parties_check
    check (from_id <> to_id)
);

create table if not exists public.agora_blocks (
  owner_id text not null references public.agora_identities(identity_id) on delete cascade,
  blocked_id text not null references public.agora_identities(identity_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, blocked_id),
  constraint agora_blocks_self_check
    check (owner_id <> blocked_id)
);

create table if not exists public.agora_reports (
  id text primary key,
  reporter_id text not null references public.agora_identities(identity_id),
  target_id text not null references public.agora_identities(identity_id),
  room_id text references public.agora_rooms(id) on delete set null,
  message_id text,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint agora_reports_id_check
    check (id ~ '^agr1[.][0-9a-f]{32}$'),
  constraint agora_reports_reason_check
    check (reason in ('harassment', 'spam', 'illegal', 'other')),
  constraint agora_reports_reason_len
    check (char_length(reason) <= 32)
);

create table if not exists public.agora_presence (
  identity_id text primary key references public.agora_identities(identity_id) on delete cascade,
  room_id text not null references public.agora_rooms(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  backgrounded_at timestamptz
);

create index if not exists agora_rooms_sort_idx
  on public.agora_rooms (sort_order, instance_index);
create index if not exists agora_messages_room_seq_idx
  on public.agora_messages (room_id, server_sequence desc);
create index if not exists agora_whispers_inbox_idx
  on public.agora_whispers (to_id, room_id, created_at desc);
create index if not exists agora_whispers_expiry_idx
  on public.agora_whispers (expires_at);
create index if not exists agora_invites_recipient_idx
  on public.agora_invites (to_id, expires_at);
create index if not exists agora_presence_room_idx
  on public.agora_presence (room_id);
create index if not exists agora_nick_tombstones_expiry_idx
  on public.agora_nick_tombstones (expires_at);

insert into public.agora_rooms (
  id, topic_id, instance_index, title, topic_line, icon,
  is_canonical, allows_overflow, read_only, sort_order
) values
  ('ago1.avisos.1', 'avisos', 1, 'Avisos', 'Rules and notices. Ops only.', 'landmark', true, false, true, 0),
  ('ago1.general.1', 'general', 1, 'General', 'hola, presentarse, no spam', 'messages', true, true, false, 10),
  ('ago1.amistad.1', 'amistad', 1, 'Amistad', 'make friends', 'heart', true, true, false, 20),
  ('ago1.humor.1', 'humor', 1, 'Humor', 'keep it kind', 'smile', true, true, false, 30),
  ('ago1.musica.1', 'musica', 1, 'Musica', 'what are you playing', 'music', true, true, false, 40),
  ('ago1.cine.1', 'cine', 1, 'Cine y series', 'films and shows', 'film', true, true, false, 50),
  ('ago1.deportes.1', 'deportes', 1, 'Deportes', 'match talk', 'trophy', true, true, false, 60),
  ('ago1.tecnologia.1', 'tecnologia', 1, 'Tecnologia', 'tools, privacy, code', 'cpu', true, true, false, 70),
  ('ago1.juegos.1', 'juegos', 1, 'Juegos', 'games', 'gamepad', true, true, false, 80),
  ('ago1.relajados.1', 'relajados', 1, 'Relajados', 'slow evening hangout', 'moon', true, true, false, 90),
  ('ago1.flirt.1', 'flirt', 1, 'Flirt', 'PG-13 only', 'sparkles', true, true, false, 100)
on conflict (id) do nothing;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'agora_rooms',
    'agora_identities',
    'agora_nick_tombstones',
    'agora_messages',
    'agora_whispers',
    'agora_invites',
    'agora_blocks',
    'agora_reports',
    'agora_presence'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    execute format('grant all on table public.%I to service_role', v_table);
  end loop;
end
$$;
