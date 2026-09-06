create index if not exists wallet_index_delivery_events_balance_pending_idx
  on public.wallet_index_delivery_events (
    lease_id,
    lease_generation,
    created_at desc,
    event_id desc
  )
  where event_kind = 'balance';

with ranked_balance_events as (
  select
    event_id,
    row_number() over (
      partition by lease_id, lease_generation
      order by created_at desc, event_id desc
    ) as row_number
  from public.wallet_index_delivery_events
  where event_kind = 'balance'
)
delete from public.wallet_index_delivery_events events
using ranked_balance_events ranked
where events.event_id = ranked.event_id
  and ranked.row_number > 1;
