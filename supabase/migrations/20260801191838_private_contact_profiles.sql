alter table public.chat_one_time_contact_cards
  add column if not exists profile_capsule jsonb;

alter table public.chat_one_time_contact_cards
  drop constraint if exists chat_one_time_contact_cards_profile_capsule_check,
  add constraint chat_one_time_contact_cards_profile_capsule_check
  check (
    profile_capsule is null or (
      jsonb_typeof(profile_capsule) = 'object'
      and profile_capsule ? 'version'
      and profile_capsule ? 'ciphertext'
      and profile_capsule ? 'nonce'
      and profile_capsule ? 'tag'
      and profile_capsule - array['version', 'ciphertext', 'nonce', 'tag'] = '{}'::jsonb
      and profile_capsule->>'version' = '1'
      and jsonb_typeof(profile_capsule->'ciphertext') = 'string'
      and jsonb_typeof(profile_capsule->'nonce') = 'string'
      and jsonb_typeof(profile_capsule->'tag') = 'string'
      and length(profile_capsule->>'ciphertext') between 4 and 349532
      and length(profile_capsule->>'nonce') = 16
      and length(profile_capsule->>'tag') = 24
    )
  );
