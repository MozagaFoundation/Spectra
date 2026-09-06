-- All application tables default to no client-visible rows.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'auth_wallet_challenges',
    'auth_wallet_bindings',
    'auth_refresh_tokens',
    'wallet_index_addresses',
    'wallet_index_user_addresses',
    'wallet_index_cursors',
    'wallet_indexer_runs',
    'wallet_index_chain_blocks',
    'wallet_index_balance_snapshots',
    'wallet_index_transactions',
    'wallet_index_history_status',
    'wallet_transfer_notifications',
    'api_rate_limits',
    'push_notification_dispatches',
    'mobile_paid_root_addresses',
    'mobile_spectre_addresses',
    'mobile_account_blind_token_issues',
    'mobile_account_blind_token_redemptions',
    'mobile_market_asset_prices',
    'mobile_fiat_rates',
    'mobile_app_records',
    'chat_key_bundles',
    'chat_one_time_prekeys',
    'chat_mailbox_token_owners',
    'group_epoch_transitions',
    'sealed_relay_messages',
    'support_tickets',
    'support_staff_roles',
    'support_ticket_assignments',
    'support_access_audit_events',
    'object_records',
    'support_ticket_attachments',
    'mobile_spectre_backup_manifests',
    'mobile_spectre_backup_audit_events',
    'account_deletion_jobs'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
  end loop;
end
$$;

revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke usage on schema public from public, anon, authenticated;

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant usage on schema extensions to service_role;
grant execute on function extensions.digest(bytea, text) to service_role;
grant execute on function extensions.digest(text, text) to service_role;
grant execute on function extensions.gen_random_bytes(integer) to service_role;

alter default privileges in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges in schema public
  revoke all privileges on sequences from anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- Queue internals and decrypted Vault values remain database-worker only.
revoke all privileges on all tables in schema pgmq from anon, authenticated;
revoke all privileges on all sequences in schema pgmq from anon, authenticated;
revoke all privileges on all tables in schema vault from anon, authenticated;
revoke execute on all functions in schema extensions from anon, authenticated;
revoke execute on all functions in schema pgmq from anon, authenticated;
