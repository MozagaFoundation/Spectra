-- Permanently remove retired feature storage and database contracts.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'broadcast_delivery',
    'broadcast_messages',
    'broadcast_recipients',
    'broadcasts',
    'community_admin_log',
    'community_invite_links',
    'community_join_requests',
    'community_members',
    'community_membership_products',
    'community_messages',
    'community_poll_votes',
    'community_polls',
    'community_topics',
    'communities',
    'exp_accounts',
    'exp_commitments',
    'exp_key_images',
    'exp_notes',
    'exp_nullifiers',
    'exp_transactions',
    'kara_jobs',
    'kara_messages',
    'kara_sessions'
  ]
  loop
    execute format('drop table if exists public.%I cascade', table_name);
  end loop;
end;
$$;

do $$
declare
  function_row record;
begin
  for function_row in
    select
      namespaces.nspname as routine_schema,
      procedures.proname as routine_name,
      pg_get_function_identity_arguments(procedures.oid) as arguments
    from pg_proc procedures
    join pg_namespace namespaces on namespaces.oid = procedures.pronamespace
    where namespaces.nspname = 'public'
      and procedures.proname = any (array[
        'mobile_add_community_message_reaction',
        'mobile_get_accessible_broadcasts',
        'mobile_get_broadcast_delivery_stats',
        'mobile_get_community_invite_by_code',
        'mobile_get_community_polls',
        'mobile_get_incoming_broadcast_messages',
        'mobile_get_user_communities',
        'mobile_redeem_community_invite',
        'mobile_remove_community_message_reaction',
        'mobile_send_broadcast_message',
        'mobile_upsert_broadcast_recipients',
        'mobile_vote_community_poll'
      ])
  loop
    execute format(
      'drop function %I.%I(%s) cascade',
      function_row.routine_schema,
      function_row.routine_name,
      function_row.arguments
    );
  end loop;
end;
$$;

delete from public.mobile_app_records
where record_table = any (array[
  'broadcast_delivery',
  'broadcast_messages',
  'broadcast_recipients',
  'broadcasts',
  'community_admin_log',
  'community_invite_links',
  'community_join_requests',
  'community_members',
  'community_membership_products',
  'community_messages',
  'community_poll_votes',
  'community_polls',
  'community_topics',
  'communities',
  'exp_accounts',
  'exp_notes',
  'kara_messages',
  'kara_sessions'
]);
