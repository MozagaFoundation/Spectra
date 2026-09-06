create index if not exists auth_refresh_tokens_replaced_by_idx
  on public.auth_refresh_tokens(replaced_by_token_hash)
  where replaced_by_token_hash is not null;

create index if not exists wallet_index_user_addresses_address_fk_idx
  on public.wallet_index_user_addresses(chain, address_hash, address);

create index if not exists chat_key_bundles_wallet_owner_fk_idx
  on public.chat_key_bundles(owner_user_id, wallet_address);

create index if not exists support_ticket_attachments_object_ref_idx
  on public.support_ticket_attachments(object_ref);
