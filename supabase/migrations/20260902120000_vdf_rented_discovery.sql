alter table public.chat_key_bundles
  add column if not exists discovery_mode text not null default 'ephemeral';

update public.chat_key_bundles
set discovery_mode = 'ephemeral'
where discovery_mode is distinct from 'ephemeral'
  and discovery_mode is distinct from 'active';

alter table public.chat_key_bundles
  drop constraint if exists chat_key_bundles_discovery_mode_check;

alter table public.chat_key_bundles
  add constraint chat_key_bundles_discovery_mode_check
  check (discovery_mode in ('ephemeral', 'active'));

alter table public.chat_key_bundles
  drop constraint if exists chat_key_bundles_public_expiry_check;

alter table public.chat_key_bundles
  add constraint chat_key_bundles_public_expiry_check
  check (
    public_expires_at > updated_at
    and (
      (
        discovery_mode = 'ephemeral'
        and public_expires_at <= updated_at + interval '10 minutes'
      )
      or (
        discovery_mode = 'active'
        and public_expires_at <= updated_at + interval '7 days'
      )
    )
  );

alter table public.chat_vdf_challenges
  drop constraint if exists chat_vdf_challenges_action_check;

alter table public.chat_vdf_challenges
  add constraint chat_vdf_challenges_action_check
  check (
    action in (
      'wallet_admission',
      'public_discovery',
      'extend_public_discovery',
      'claim_session_opk',
      'contact_card'
    )
  );
