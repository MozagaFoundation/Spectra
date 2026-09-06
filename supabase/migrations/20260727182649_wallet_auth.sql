create table if not exists public.auth_wallet_challenges (
  challenge text primary key,
  user_id text not null,
  wallet_address text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  constraint auth_wallet_challenges_user_check
    check (length(user_id) between 8 and 256),
  constraint auth_wallet_challenges_wallet_check
    check (wallet_address ~ '^EXO00[0-9a-f]{38}$'),
  constraint auth_wallet_challenges_value_check
    check (length(challenge) between 32 and 8192),
  constraint auth_wallet_challenges_time_check
    check (
      expires_at > created_at
      and (consumed_at is null or consumed_at >= created_at)
    )
);

create index if not exists auth_wallet_challenges_user_created_idx
  on public.auth_wallet_challenges (user_id, created_at desc);
create index if not exists auth_wallet_challenges_expiry_idx
  on public.auth_wallet_challenges (expires_at);
create index if not exists auth_wallet_challenges_cleanup_idx
  on public.auth_wallet_challenges (expires_at)
  where consumed_at is not null;
create index if not exists auth_wallet_challenges_unconsumed_expiry_idx
  on public.auth_wallet_challenges (expires_at)
  where consumed_at is null;

create table if not exists public.auth_wallet_bindings (
  wallet_address text primary key,
  user_id text not null,
  public_key text not null,
  identity_id text,
  verified_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint auth_wallet_bindings_user_check
    check (length(user_id) between 8 and 256),
  constraint auth_wallet_bindings_wallet_check
    check (wallet_address ~ '^EXO00[0-9a-f]{38}$'),
  constraint auth_wallet_bindings_public_key_check
    check (
      length(public_key) = 3906
      and left(public_key, 2) = '0x'
      and substring(public_key from 3) ~ '^[0-9a-fA-F]+$'
    ),
  constraint auth_wallet_bindings_identity_check
    check (identity_id is null or length(identity_id) between 8 and 256),
  constraint auth_wallet_bindings_user_wallet_unique
    unique (user_id, wallet_address)
);

create index if not exists auth_wallet_bindings_user_verified_idx
  on public.auth_wallet_bindings (user_id, verified_at desc, wallet_address);
create unique index if not exists auth_wallet_bindings_identity_unique_idx
  on public.auth_wallet_bindings (identity_id)
  where identity_id is not null;

create table if not exists public.auth_refresh_tokens (
  token_hash text primary key,
  session_id text not null unique,
  user_id text not null,
  wallet_address text not null,
  identity_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  rotated_at timestamptz,
  revoked_at timestamptz,
  replaced_by_token_hash text,
  constraint auth_refresh_tokens_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint auth_refresh_tokens_replacement_hash_check
    check (
      replaced_by_token_hash is null
      or replaced_by_token_hash ~ '^[0-9a-f]{64}$'
    ),
  constraint auth_refresh_tokens_user_check
    check (length(user_id) between 8 and 256),
  constraint auth_refresh_tokens_wallet_check
    check (wallet_address ~ '^EXO00[0-9a-f]{38}$'),
  constraint auth_refresh_tokens_identity_check
    check (identity_id is null or length(identity_id) between 8 and 256),
  constraint auth_refresh_tokens_time_check
    check (
      expires_at > created_at
      and (rotated_at is null or rotated_at >= created_at)
      and (revoked_at is null or revoked_at >= created_at)
    ),
  constraint auth_refresh_tokens_replaced_fk
    foreign key (replaced_by_token_hash)
    references public.auth_refresh_tokens(token_hash)
    on delete set null
    deferrable initially deferred
);

create index if not exists auth_refresh_tokens_user_created_idx
  on public.auth_refresh_tokens (user_id, created_at desc);
create index if not exists auth_refresh_tokens_expiry_idx
  on public.auth_refresh_tokens (expires_at);
create index if not exists auth_refresh_tokens_active_user_idx
  on public.auth_refresh_tokens (user_id, expires_at)
  where rotated_at is null and revoked_at is null;
create index if not exists auth_refresh_tokens_replaced_by_idx
  on public.auth_refresh_tokens (replaced_by_token_hash)
  where replaced_by_token_hash is not null;

drop trigger if exists auth_wallet_bindings_set_updated_at on public.auth_wallet_bindings;
create trigger auth_wallet_bindings_set_updated_at
before update on public.auth_wallet_bindings
for each row execute function spectra_private.set_updated_at();
