create table if not exists public.wallet_index_addresses (
  address_hash text primary key,
  chain text not null,
  address text not null,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  last_indexed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_index_addresses_hash_check
    check (address_hash ~ '^[0-9a-f]{64}$'),
  constraint wallet_index_addresses_chain_check
    check (chain in ('mozaga', 'ethereum', 'bitcoin', 'solana', 'tron')),
  constraint wallet_index_addresses_address_check
    check (length(address) between 26 and 96),
  constraint wallet_index_addresses_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint wallet_index_addresses_chain_hash_unique
    unique (chain, address_hash),
  constraint wallet_index_addresses_chain_hash_address_unique
    unique (chain, address_hash, address)
);

create unique index if not exists wallet_index_addresses_chain_address_idx
  on public.wallet_index_addresses (chain, address);
create index if not exists wallet_index_addresses_scan_idx
  on public.wallet_index_addresses (chain, is_active, last_indexed_at, updated_at);

create table if not exists public.wallet_index_user_addresses (
  user_id text not null,
  chain text not null,
  address_hash text not null,
  address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, chain, address_hash),
  constraint wallet_index_user_addresses_user_check
    check (length(user_id) between 8 and 256),
  constraint wallet_index_user_addresses_chain_check
    check (chain in ('mozaga', 'ethereum', 'bitcoin', 'solana', 'tron')),
  constraint wallet_index_user_addresses_hash_check
    check (address_hash ~ '^[0-9a-f]{64}$'),
  constraint wallet_index_user_addresses_address_fk
    foreign key (chain, address_hash, address)
    references public.wallet_index_addresses(chain, address_hash, address)
    on delete cascade
);

create index if not exists wallet_index_user_addresses_lookup_idx
  on public.wallet_index_user_addresses (chain, address_hash, user_id);
create index if not exists wallet_index_user_addresses_address_fk_idx
  on public.wallet_index_user_addresses (chain, address_hash, address);

create table if not exists public.wallet_index_cursors (
  chain text not null,
  cursor_name text not null default 'transactions',
  run_id text,
  locked_at timestamptz,
  lock_expires_at timestamptz,
  last_scanned_height numeric,
  last_finalized_height numeric,
  latest_status text,
  latest_error text,
  updated_at timestamptz not null default now(),
  primary key (chain, cursor_name),
  constraint wallet_index_cursors_chain_check
    check (chain in ('mozaga', 'ethereum', 'bitcoin', 'solana', 'tron')),
  constraint wallet_index_cursors_name_check
    check (cursor_name in (
      'native_balance',
      'transactions',
      'transactions_backfill',
      'balance_indexer_run',
      'transaction_indexer_run'
    )),
  constraint wallet_index_cursors_height_check
    check (
      (last_scanned_height is null or last_scanned_height >= 0)
      and (last_finalized_height is null or last_finalized_height >= 0)
    ),
  constraint wallet_index_cursors_lock_check
    check (
      (locked_at is null and lock_expires_at is null)
      or (locked_at is not null and lock_expires_at > locked_at)
    ),
  constraint wallet_index_cursors_status_check
    check (
      latest_status is null
      or latest_status in ('completed', 'completed_with_errors', 'skipped', 'failed')
    ),
  constraint wallet_index_cursors_error_check
    check (latest_error is null or length(latest_error) <= 2048)
);

create table if not exists public.wallet_indexer_runs (
  run_id text not null,
  chain text not null,
  mode text not null,
  requested_chains text[] not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null,
  scanned integer not null default 0,
  updated integer not null default 0,
  transactions integer not null default 0,
  token_transfers integer not null default 0,
  failed integer not null default 0,
  skipped integer not null default 0,
  error text,
  primary key (run_id, chain),
  constraint wallet_indexer_runs_chain_check
    check (chain in ('mozaga', 'ethereum', 'bitcoin', 'solana', 'tron')),
  constraint wallet_indexer_runs_requested_chains_check
    check (
      cardinality(requested_chains) between 1 and 5
      and requested_chains <@ array['mozaga', 'ethereum', 'bitcoin', 'solana', 'tron']::text[]
    ),
  constraint wallet_indexer_runs_mode_check
    check (mode in ('balances', 'transactions', 'all', 'backfill')),
  constraint wallet_indexer_runs_status_check
    check (status in ('running', 'completed', 'completed_with_errors', 'skipped', 'failed')),
  constraint wallet_indexer_runs_count_check
    check (
      scanned >= 0 and updated >= 0 and transactions >= 0
      and token_transfers >= 0 and failed >= 0 and skipped >= 0
    ),
  constraint wallet_indexer_runs_time_check
    check (finished_at is null or finished_at >= started_at),
  constraint wallet_indexer_runs_error_check
    check (error is null or length(error) <= 2048)
);

create index if not exists wallet_indexer_runs_status_started_idx
  on public.wallet_indexer_runs (status, started_at desc);

create table if not exists public.wallet_index_chain_blocks (
  chain text not null,
  block_height numeric not null,
  block_hash text not null,
  parent_hash text,
  block_timestamp timestamptz,
  indexed_at timestamptz not null default now(),
  primary key (chain, block_height),
  constraint wallet_index_chain_blocks_chain_check
    check (chain in ('mozaga', 'ethereum', 'bitcoin', 'solana', 'tron')),
  constraint wallet_index_chain_blocks_height_check
    check (block_height >= 0)
);

create index if not exists wallet_index_chain_blocks_recent_idx
  on public.wallet_index_chain_blocks (chain, block_height desc);

create table if not exists public.wallet_index_balance_snapshots (
  chain text not null,
  address_hash text not null,
  updated_at timestamptz not null,
  native_balance_atomic text not null,
  native_symbol text not null,
  token_balances jsonb not null default '[]'::jsonb,
  block_height numeric not null,
  primary key (chain, address_hash),
  constraint wallet_index_balance_snapshots_chain_check
    check (chain in ('mozaga', 'ethereum', 'bitcoin', 'solana', 'tron')),
  constraint wallet_index_balance_snapshots_hash_check
    check (address_hash ~ '^[0-9a-f]{64}$'),
  constraint wallet_index_balance_snapshots_token_check
    check (jsonb_typeof(token_balances) = 'array'),
  constraint wallet_index_balance_snapshots_height_check
    check (block_height >= 0),
  constraint wallet_index_balance_snapshots_address_fk
    foreign key (chain, address_hash)
    references public.wallet_index_addresses(chain, address_hash)
    on delete cascade
);

create index if not exists wallet_index_balance_snapshots_updated_idx
  on public.wallet_index_balance_snapshots (chain, updated_at desc);

create table if not exists public.wallet_index_transactions (
  chain text not null,
  address_hash text not null,
  tx_hash text not null,
  occurred_at timestamptz not null,
  direction text not null,
  status text not null,
  block_height numeric not null,
  native_amount_atomic text not null,
  native_symbol text not null,
  fee_atomic text,
  counterparty_address text,
  token_transfers jsonb not null default '[]'::jsonb,
  indexed_at timestamptz not null default now(),
  primary key (chain, address_hash, tx_hash),
  constraint wallet_index_transactions_chain_check
    check (chain in ('mozaga', 'ethereum', 'bitcoin', 'solana', 'tron')),
  constraint wallet_index_transactions_hash_check
    check (address_hash ~ '^[0-9a-f]{64}$'),
  constraint wallet_index_transactions_direction_check
    check (direction in ('inbound', 'outbound', 'self', 'unknown')),
  constraint wallet_index_transactions_status_check
    check (status in ('pending', 'confirmed', 'failed', 'dropped')),
  constraint wallet_index_transactions_token_check
    check (jsonb_typeof(token_transfers) = 'array'),
  constraint wallet_index_transactions_height_check
    check (block_height >= 0),
  constraint wallet_index_transactions_address_fk
    foreign key (chain, address_hash)
    references public.wallet_index_addresses(chain, address_hash)
    on delete cascade
);

create index if not exists wallet_index_transactions_address_time_idx
  on public.wallet_index_transactions (chain, address_hash, occurred_at desc, tx_hash);
create index if not exists wallet_index_transactions_chain_block_idx
  on public.wallet_index_transactions (chain, block_height desc);
create index if not exists wallet_index_transactions_hash_lookup_idx
  on public.wallet_index_transactions (chain, tx_hash, address_hash);

create table if not exists public.wallet_index_history_status (
  chain text not null,
  address_hash text not null,
  latest_transaction_at timestamptz,
  transaction_count numeric not null default 0,
  transaction_cursor_height numeric not null default 0,
  backfill_cursor_height numeric not null default 0,
  latest_run_status text not null,
  latest_run_finished_at timestamptz not null,
  latest_run_error text,
  primary key (chain, address_hash),
  constraint wallet_index_history_status_chain_check
    check (chain in ('mozaga', 'ethereum', 'bitcoin', 'solana', 'tron')),
  constraint wallet_index_history_status_hash_check
    check (address_hash ~ '^[0-9a-f]{64}$'),
  constraint wallet_index_history_status_count_check
    check (
      transaction_count >= 0
      and transaction_cursor_height >= 0
      and backfill_cursor_height >= 0
    ),
  constraint wallet_index_history_status_status_check
    check (latest_run_status in ('completed', 'completed_with_errors', 'skipped', 'failed')),
  constraint wallet_index_history_status_error_check
    check (latest_run_error is null or length(latest_run_error) <= 2048),
  constraint wallet_index_history_status_address_fk
    foreign key (chain, address_hash)
    references public.wallet_index_addresses(chain, address_hash)
    on delete cascade
);

create table if not exists public.wallet_transfer_notifications (
  user_id text not null,
  chain text not null,
  address_hash text not null,
  tx_hash text not null,
  occurred_at timestamptz not null,
  native_amount_atomic text not null,
  native_symbol text not null,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, chain, address_hash, tx_hash),
  constraint wallet_transfer_notifications_owner_fk
    foreign key (user_id, chain, address_hash)
    references public.wallet_index_user_addresses(user_id, chain, address_hash)
    on delete cascade,
  constraint wallet_transfer_notifications_time_check
    check (
      (read_at is null or read_at >= created_at)
      and (pushed_at is null or pushed_at >= created_at)
    )
);

create index if not exists wallet_transfer_notifications_unread_idx
  on public.wallet_transfer_notifications (user_id, chain, occurred_at desc)
  where read_at is null;
create index if not exists wallet_transfer_notifications_push_idx
  on public.wallet_transfer_notifications (occurred_at desc)
  where pushed_at is null;

create table if not exists public.api_rate_limits (
  key_hash text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  expires_at timestamptz not null,
  primary key (key_hash, window_start),
  constraint api_rate_limits_key_hash_check
    check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint api_rate_limits_count_check
    check (request_count >= 0),
  constraint api_rate_limits_window_check
    check (expires_at > window_start)
);

create index if not exists api_rate_limits_expiry_idx
  on public.api_rate_limits (expires_at);

create table if not exists public.push_notification_dispatches (
  dispatch_key text primary key,
  created_at timestamptz not null default now(),
  constraint push_notification_dispatches_key_check
    check (
      length(dispatch_key) between 8 and 256
      and dispatch_key ~ '^[a-z0-9:_-]+$'
    )
);

create index if not exists push_notification_dispatches_created_idx
  on public.push_notification_dispatches (created_at);

drop trigger if exists wallet_index_addresses_set_updated_at on public.wallet_index_addresses;
create trigger wallet_index_addresses_set_updated_at
before update on public.wallet_index_addresses
for each row execute function spectra_private.set_updated_at();

drop trigger if exists wallet_index_user_addresses_set_updated_at on public.wallet_index_user_addresses;
create trigger wallet_index_user_addresses_set_updated_at
before update on public.wallet_index_user_addresses
for each row execute function spectra_private.set_updated_at();
