-- Keep Explorer pagination state separate from chain RPC cursors.

create table if not exists public.wallet_index_external_history_cursors (
  chain text not null,
  address_hash text not null,
  next_cursor text,
  sync_complete boolean not null default false,
  last_synced_at timestamptz,
  latest_error text,
  updated_at timestamptz not null default now(),
  primary key (chain, address_hash),
  constraint wallet_index_external_history_cursors_chain_check
    check (chain = 'mozaga'),
  constraint wallet_index_external_history_cursors_hash_check
    check (address_hash ~ '^[0-9a-f]{64}$'),
  constraint wallet_index_external_history_cursors_cursor_check
    check (next_cursor is null or length(next_cursor) between 1 and 1024),
  constraint wallet_index_external_history_cursors_error_check
    check (latest_error is null or length(latest_error) between 1 and 128),
  constraint wallet_index_external_history_cursors_address_fk
    foreign key (chain, address_hash)
    references public.wallet_index_addresses(chain, address_hash)
    on delete cascade
);

create index if not exists wallet_index_external_history_cursors_pending_idx
  on public.wallet_index_external_history_cursors (chain, sync_complete, updated_at);

alter table public.wallet_index_external_history_cursors enable row level security;
alter table public.wallet_index_external_history_cursors force row level security;
revoke all on table public.wallet_index_external_history_cursors from anon, authenticated;
grant all on table public.wallet_index_external_history_cursors to service_role;

create policy wallet_index_external_history_cursors_deny_clients
on public.wallet_index_external_history_cursors
for all
to anon, authenticated
using (false)
with check (false);
