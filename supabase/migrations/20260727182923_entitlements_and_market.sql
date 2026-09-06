create table if not exists public.mobile_paid_root_addresses (
  wallet_address text primary key,
  tier text not null default 'spectre',
  billing_source text not null default 'manual_entitlement',
  status text not null default 'active',
  notes text,
  activated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_paid_root_addresses_wallet_check
    check (wallet_address ~ '^EXO00[0-9a-f]{38}$'),
  constraint mobile_paid_root_addresses_tier_check
    check (tier = 'spectre'),
  constraint mobile_paid_root_addresses_billing_check
    check (billing_source = 'manual_entitlement'),
  constraint mobile_paid_root_addresses_status_check
    check (status in ('active', 'revoked')),
  constraint mobile_paid_root_addresses_deactivation_check
    check (
      (status = 'active' and deactivated_at is null)
      or (status = 'revoked' and deactivated_at is not null)
    )
);

create index if not exists mobile_paid_root_addresses_status_idx
  on public.mobile_paid_root_addresses (status, updated_at desc);

-- Only pre-issued ephemeral Spectre wallets use blind activation.
create table if not exists public.mobile_spectre_addresses (
  wallet_address text primary key,
  is_ephemeral boolean not null default true,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_spectre_addresses_wallet_check
    check (wallet_address ~ '^EXO00[0-9a-f]{38}$'),
  constraint mobile_spectre_addresses_ephemeral_check
    check (is_ephemeral = true),
  constraint mobile_spectre_addresses_expiry_check
    check (
      expires_at > activated_at
      and expires_at <= activated_at + interval '24 hours'
    )
);

create index if not exists mobile_spectre_addresses_expiry_idx
  on public.mobile_spectre_addresses (expires_at);

create table if not exists public.mobile_account_blind_token_issues (
  wallet_address text not null
    references public.mobile_paid_root_addresses(wallet_address) on delete cascade,
  ticket_purpose text not null default 'spectre_ephemeral',
  period_start date not null default date '1970-01-01',
  issued_count integer not null default 0,
  last_issued_at timestamptz,
  next_available_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (wallet_address, ticket_purpose, period_start),
  constraint mobile_account_blind_token_issues_purpose_check
    check (ticket_purpose = 'spectre_ephemeral'),
  constraint mobile_account_blind_token_issues_period_check
    check (period_start = date '1970-01-01'),
  constraint mobile_account_blind_token_issues_count_check
    check (issued_count between 0 and 1),
  constraint mobile_account_blind_token_issues_time_check
    check (
      (last_issued_at is null and next_available_at is null and issued_count = 0)
      or (
        last_issued_at is not null
        and next_available_at >= last_issued_at + interval '24 hours'
      )
    )
);

create index if not exists mobile_account_blind_token_issues_available_idx
  on public.mobile_account_blind_token_issues (next_available_at)
  where next_available_at is not null;

-- No root-wallet foreign key: redemption must not create a root-to-Spectre link.
create table if not exists public.mobile_account_blind_token_redemptions (
  nullifier_hash text primary key,
  wallet_address text not null,
  ticket_purpose text not null default 'spectre_ephemeral',
  token_key_id text not null,
  is_ephemeral boolean not null default true,
  redeemed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_account_blind_token_redemptions_hash_check
    check (nullifier_hash ~ '^[0-9a-f]{64}$'),
  constraint mobile_account_blind_token_redemptions_wallet_check
    check (wallet_address ~ '^EXO00[0-9a-f]{38}$'),
  constraint mobile_account_blind_token_redemptions_purpose_check
    check (ticket_purpose = 'spectre_ephemeral'),
  constraint mobile_account_blind_token_redemptions_ephemeral_check
    check (is_ephemeral = true),
  constraint mobile_account_blind_token_redemptions_key_check
    check (length(btrim(token_key_id)) between 1 and 128)
);

create index if not exists mobile_account_blind_token_redemptions_wallet_idx
  on public.mobile_account_blind_token_redemptions (wallet_address, redeemed_at desc);

create table if not exists public.mobile_market_asset_prices (
  symbol text primary key,
  coingecko_id text,
  usd_rate numeric not null,
  manual_override boolean not null default false,
  source text not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint mobile_market_asset_prices_symbol_check
    check (symbol in ('EXO', 'ETH', 'BTC', 'SOL', 'TRX', 'USDT')),
  constraint mobile_market_asset_prices_rate_check
    check (usd_rate > 0),
  constraint mobile_market_asset_prices_source_check
    check (source in ('manual', 'coingecko')),
  constraint mobile_market_asset_prices_source_shape_check
    check (
      (manual_override and source = 'manual' and expires_at = 'infinity'::timestamptz)
      or (not manual_override and source = 'coingecko' and coingecko_id is not null)
    )
);

create index if not exists mobile_market_asset_prices_expiry_idx
  on public.mobile_market_asset_prices (expires_at)
  where not manual_override;

insert into public.mobile_market_asset_prices (
  symbol, coingecko_id, usd_rate, manual_override, source, fetched_at, expires_at
) values
  ('EXO', null, 0.01, true, 'manual', now(), 'infinity'::timestamptz),
  ('ETH', 'ethereum', 3000, false, 'coingecko', now(), now()),
  ('BTC', 'bitcoin', 60000, false, 'coingecko', now(), now()),
  ('SOL', 'solana', 150, false, 'coingecko', now(), now()),
  ('TRX', 'tron', 0.12, false, 'coingecko', now(), now()),
  ('USDT', 'tether', 1, false, 'coingecko', now(), now())
on conflict (symbol) do nothing;

create table if not exists public.mobile_fiat_rates (
  code text primary key,
  usd_rate numeric not null,
  source text not null default 'manual',
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint mobile_fiat_rates_code_check
    check (code ~ '^[A-Z]{3}$'),
  constraint mobile_fiat_rates_rate_check
    check (usd_rate > 0),
  constraint mobile_fiat_rates_source_check
    check (length(btrim(source)) between 1 and 64)
);

create index if not exists mobile_fiat_rates_expiry_idx
  on public.mobile_fiat_rates (expires_at);

insert into public.mobile_fiat_rates (
  code, usd_rate, source, fetched_at, expires_at
) values
  ('USD', 1, 'manual', now(), 'infinity'::timestamptz),
  ('EUR', 1, 'forex', now(), now()),
  ('GBP', 1, 'forex', now(), now()),
  ('CAD', 1, 'forex', now(), now()),
  ('AUD', 1, 'forex', now(), now()),
  ('BRL', 1, 'forex', now(), now()),
  ('MXN', 1, 'forex', now(), now()),
  ('INR', 1, 'forex', now(), now()),
  ('IDR', 1, 'forex', now(), now()),
  ('PHP', 1, 'forex', now(), now()),
  ('VES', 1, 'forex', now(), now())
on conflict (code) do nothing;

drop trigger if exists mobile_paid_root_addresses_set_updated_at on public.mobile_paid_root_addresses;
create trigger mobile_paid_root_addresses_set_updated_at
before update on public.mobile_paid_root_addresses
for each row execute function spectra_private.set_updated_at();

drop trigger if exists mobile_spectre_addresses_set_updated_at on public.mobile_spectre_addresses;
create trigger mobile_spectre_addresses_set_updated_at
before update on public.mobile_spectre_addresses
for each row execute function spectra_private.set_updated_at();

drop trigger if exists mobile_account_blind_token_issues_set_updated_at on public.mobile_account_blind_token_issues;
create trigger mobile_account_blind_token_issues_set_updated_at
before update on public.mobile_account_blind_token_issues
for each row execute function spectra_private.set_updated_at();

drop trigger if exists mobile_account_blind_token_redemptions_set_updated_at on public.mobile_account_blind_token_redemptions;
create trigger mobile_account_blind_token_redemptions_set_updated_at
before update on public.mobile_account_blind_token_redemptions
for each row execute function spectra_private.set_updated_at();

drop trigger if exists mobile_market_asset_prices_set_updated_at on public.mobile_market_asset_prices;
create trigger mobile_market_asset_prices_set_updated_at
before update on public.mobile_market_asset_prices
for each row execute function spectra_private.set_updated_at();

drop trigger if exists mobile_fiat_rates_set_updated_at on public.mobile_fiat_rates;
create trigger mobile_fiat_rates_set_updated_at
before update on public.mobile_fiat_rates
for each row execute function spectra_private.set_updated_at();
