-- Split Agora rooms into Spanish and English catalogs.

alter table public.agora_rooms
  add column if not exists locale text not null default 'es';

alter table public.agora_rooms
  drop constraint if exists agora_rooms_locale_check;
alter table public.agora_rooms
  add constraint agora_rooms_locale_check
  check (locale in ('en', 'es'));

alter table public.agora_identities
  add column if not exists plaza_locale text not null default 'es';

alter table public.agora_identities
  drop constraint if exists agora_identities_plaza_locale_check;
alter table public.agora_identities
  add constraint agora_identities_plaza_locale_check
  check (plaza_locale in ('en', 'es'));

update public.agora_rooms
set
  locale = 'es',
  title = case id
    when 'ago1.general.1' then 'Público'
    when 'ago1.musica.1' then 'Música'
    when 'ago1.tecnologia.1' then 'Tecnología'
    else title
  end,
  topic_line = case id
    when 'ago1.avisos.1' then 'Reglas y avisos. Solo ops.'
    when 'ago1.general.1' then 'hola, presentarse, no spam'
    when 'ago1.amistad.1' then 'hacer amigos'
    when 'ago1.humor.1' then 'con respeto'
    when 'ago1.musica.1' then 'qué estás escuchando'
    when 'ago1.cine.1' then 'películas y series'
    when 'ago1.deportes.1' then 'charla de partidos'
    when 'ago1.tecnologia.1' then 'herramientas, privacidad, código'
    when 'ago1.juegos.1' then 'juegos'
    when 'ago1.relajados.1' then 'tarde tranquila'
    when 'ago1.flirt.1' then 'solo PG-13'
    else topic_line
  end;

insert into public.agora_rooms (
  id, topic_id, instance_index, title, topic_line, icon,
  is_canonical, allows_overflow, read_only, sort_order, locale
) values
  ('ago1.en_avisos.1', 'en_avisos', 1, 'Notices', 'Rules and notices. Ops only.', 'landmark', true, false, true, 0, 'en'),
  ('ago1.en_public.1', 'en_public', 1, 'Public', 'hello, introduce yourself, no spam', 'messages', true, true, false, 10, 'en'),
  ('ago1.en_amistad.1', 'en_amistad', 1, 'Friendship', 'make friends', 'heart', true, true, false, 20, 'en'),
  ('ago1.en_humor.1', 'en_humor', 1, 'Humor', 'keep it kind', 'smile', true, true, false, 30, 'en'),
  ('ago1.en_musica.1', 'en_musica', 1, 'Music', 'what are you playing', 'music', true, true, false, 40, 'en'),
  ('ago1.en_cine.1', 'en_cine', 1, 'Films & series', 'films and shows', 'film', true, true, false, 50, 'en'),
  ('ago1.en_deportes.1', 'en_deportes', 1, 'Sports', 'match talk', 'trophy', true, true, false, 60, 'en'),
  ('ago1.en_tecnologia.1', 'en_tecnologia', 1, 'Technology', 'tools, privacy, code', 'cpu', true, true, false, 70, 'en'),
  ('ago1.en_juegos.1', 'en_juegos', 1, 'Games', 'games', 'gamepad', true, true, false, 80, 'en'),
  ('ago1.en_relajados.1', 'en_relajados', 1, 'Chill', 'slow evening hangout', 'moon', true, true, false, 90, 'en'),
  ('ago1.en_flirt.1', 'en_flirt', 1, 'Flirt', 'PG-13 only', 'sparkles', true, true, false, 100, 'en')
on conflict (id) do nothing;
