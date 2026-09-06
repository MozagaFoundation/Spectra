-- Required for hashes/IDs, queues, scheduled retention, and secure webhooks.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_net with schema extensions;
create extension if not exists pgmq;
create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists spectra_private;

revoke create on schema public from public;
revoke all on schema spectra_private from public, anon, authenticated;
revoke all on schema vault from public, anon, authenticated;
revoke all on schema pgmq from public, anon, authenticated;
revoke execute on all functions in schema extensions from public, anon, authenticated;
revoke execute on all functions in schema pgmq from public, anon, authenticated;

create or replace function spectra_private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function spectra_private.new_relay_message_id()
returns text
language sql
volatile
set search_path = pg_catalog, extensions
as $$
  select 'msg_' || encode(extensions.gen_random_bytes(16), 'hex')
$$;

revoke all on all functions in schema spectra_private from public, anon, authenticated;
