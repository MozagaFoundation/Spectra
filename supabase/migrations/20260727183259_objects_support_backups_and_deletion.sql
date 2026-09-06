create table if not exists public.support_tickets (
  id text primary key,
  owner_user_id text not null,
  user_address text not null,
  category text not null,
  description text not null,
  app_version text not null,
  os text not null,
  device_model text not null,
  status text not null default 'open',
  retention_expires_at timestamptz not null default (now() + interval '2 years'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_id_check
    check (id ~ '^st1[.][0-9a-f]{32}$'),
  constraint support_tickets_owner_check
    check (length(owner_user_id) between 8 and 256),
  constraint support_tickets_category_check
    check (category in ('bug', 'feature_request', 'security_concern', 'other')),
  constraint support_tickets_description_check
    check (length(description) between 1 and 20000),
  constraint support_tickets_status_check
    check (status in ('open', 'in_progress', 'resolved', 'closed', 'deleted')),
  constraint support_tickets_retention_check
    check (retention_expires_at > created_at)
);

create index if not exists support_tickets_owner_created_idx
  on public.support_tickets (owner_user_id, created_at desc);
create index if not exists support_tickets_retention_idx
  on public.support_tickets (retention_expires_at)
  where status <> 'deleted';

create table if not exists public.support_staff_roles (
  user_id text primary key,
  role text not null,
  active boolean not null default true,
  granted_by_user_id text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint support_staff_roles_user_check
    check (length(user_id) between 8 and 256),
  constraint support_staff_roles_role_check
    check (role in ('support_agent', 'support_lead')),
  constraint support_staff_roles_state_check
    check ((active and revoked_at is null) or (not active and revoked_at is not null))
);

create table if not exists public.support_ticket_assignments (
  ticket_id text not null
    references public.support_tickets(id) on delete cascade,
  staff_user_id text not null
    references public.support_staff_roles(user_id),
  assigned_by_user_id text not null,
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  primary key (ticket_id, staff_user_id),
  constraint support_ticket_assignments_state_check
    check ((active and ended_at is null) or (not active and ended_at is not null))
);

create index if not exists support_ticket_assignments_active_staff_idx
  on public.support_ticket_assignments (staff_user_id, assigned_at desc)
  where active;

create table if not exists public.support_access_audit_events (
  id bigint generated always as identity primary key,
  ticket_id text not null
    references public.support_tickets(id) on delete cascade,
  actor_user_id text not null,
  event_type text not null,
  object_ref text,
  created_at timestamptz not null default now(),
  constraint support_access_audit_events_actor_check
    check (length(actor_user_id) between 8 and 256),
  constraint support_access_audit_events_type_check
    check (event_type in (
      'ticket_create',
      'ticket_read',
      'attachment_add',
      'attachment_download',
      'assign'
    ))
);

create index if not exists support_access_audit_ticket_created_idx
  on public.support_access_audit_events (ticket_id, created_at desc);
create index if not exists support_access_audit_retention_idx
  on public.support_access_audit_events (created_at);

create table if not exists public.object_records (
  object_ref text primary key,
  object_key text not null unique,
  owner_user_id text not null,
  purpose text not null,
  visibility text not null default 'private',
  chat_media_id text,
  chat_id text,
  ticket_id text references public.support_tickets(id) on delete cascade,
  lifecycle text not null default 'pending',
  declared_size bigint not null,
  uploaded_at timestamptz,
  retention_expires_at timestamptz,
  deleted_at timestamptz,
  cleanup_queued_at timestamptz,
  storage_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint object_records_ref_check
    check (object_ref = 'spectra://objects/' || object_key),
  constraint object_records_key_check
    check (
      object_key ~ '^users/[0-9a-f]{64}/(avatars|attachments|support-attachments|spectre-backups)/[0-9a-f]{32}[.]enc$'
      and split_part(object_key, '/', 2) =
        encode(extensions.digest(owner_user_id, 'sha256'), 'hex')
    ),
  constraint object_records_owner_check
    check (length(owner_user_id) between 8 and 256),
  constraint object_records_purpose_check
    check (purpose in ('public_avatar', 'chat_media', 'support_attachment', 'internal_backup')),
  constraint object_records_purpose_path_check
    check (
      split_part(object_key, '/', 3) = case purpose
        when 'public_avatar' then 'avatars'
        when 'chat_media' then 'attachments'
        when 'support_attachment' then 'support-attachments'
        when 'internal_backup' then 'spectre-backups'
      end
    ),
  constraint object_records_visibility_check
    check (
      (purpose = 'public_avatar' and visibility = 'authenticated_public')
      or (purpose <> 'public_avatar' and visibility = 'private')
    ),
  constraint object_records_binding_check
    check (
      (purpose = 'support_attachment' and ticket_id is not null)
      or (purpose <> 'support_attachment' and ticket_id is null)
    ),
  constraint object_records_lifecycle_check
    check (lifecycle in ('pending', 'active', 'deletion_pending', 'deleted', 'expired')),
  constraint object_records_size_check
    check (
      declared_size > 0
      and declared_size <= case
        when purpose = 'internal_backup' then 104857600
        else 52428800
      end
    ),
  constraint object_records_time_check
    check (
      (uploaded_at is null or uploaded_at >= created_at)
      and (retention_expires_at is null or retention_expires_at > created_at)
      and (
        lifecycle not in ('deletion_pending', 'deleted', 'expired')
        or deleted_at is not null
      )
      and (cleanup_queued_at is null or deleted_at is not null)
      and (storage_deleted_at is null or lifecycle = 'deleted')
    )
);

create index if not exists object_records_owner_lifecycle_idx
  on public.object_records (owner_user_id, lifecycle, created_at);
create index if not exists object_records_chat_media_idx
  on public.object_records (chat_media_id)
  where chat_media_id is not null;
create index if not exists object_records_ticket_idx
  on public.object_records (ticket_id)
  where ticket_id is not null;
create index if not exists object_records_retention_idx
  on public.object_records (retention_expires_at)
  where retention_expires_at is not null
    and lifecycle in ('pending', 'active');
create index if not exists object_records_cleanup_idx
  on public.object_records (cleanup_queued_at, deleted_at)
  where lifecycle = 'deletion_pending';

create table if not exists public.support_ticket_attachments (
  ticket_id text not null
    references public.support_tickets(id) on delete cascade,
  object_ref text not null
    references public.object_records(object_ref) on delete cascade,
  owner_user_id text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (ticket_id, object_ref),
  constraint support_ticket_attachments_owner_check
    check (length(owner_user_id) between 8 and 256)
);
create index if not exists support_ticket_attachments_object_ref_idx
  on public.support_ticket_attachments (object_ref);

create table if not exists public.mobile_spectre_backup_manifests (
  id text primary key,
  user_id text not null,
  wallet_address text not null,
  identity_id text,
  backup_schema_version integer not null,
  backup_kind text not null,
  status text not null default 'pending',
  object_ref text not null unique
    references public.object_records(object_ref) on delete restrict,
  payload_sha256 text not null,
  payload_bytes bigint not null,
  encryption jsonb not null,
  summary jsonb not null default '{}'::jsonb,
  device_label text,
  client_created_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  deleted_at timestamptz,
  delete_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_spectre_backup_id_check
    check (id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  constraint mobile_spectre_backup_user_check
    check (length(user_id) between 8 and 256),
  constraint mobile_spectre_backup_wallet_check
    check (wallet_address ~ '^EXO00[0-9a-f]{38}$'),
  constraint mobile_spectre_backup_identity_check
    check (identity_id is null or length(btrim(identity_id)) between 1 and 128),
  constraint mobile_spectre_backup_schema_check
    check (backup_schema_version between 1 and 16),
  constraint mobile_spectre_backup_kind_check
    check (backup_kind in ('cloud_backup', 'device_transfer')),
  constraint mobile_spectre_backup_status_check
    check (status in ('pending', 'active', 'deleted', 'expired', 'redeemed', 'failed')),
  constraint mobile_spectre_backup_ref_check
    check (object_ref ~ '^spectra://objects/users/[0-9a-f]{64}/spectre-backups/[0-9a-f]{32}[.]enc$'),
  constraint mobile_spectre_backup_hash_check
    check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  constraint mobile_spectre_backup_bytes_check
    check (payload_bytes between 1 and 104857600),
  constraint mobile_spectre_backup_json_check
    check (jsonb_typeof(encryption) = 'object' and jsonb_typeof(summary) = 'object'),
  constraint mobile_spectre_backup_delete_reason_check
    check (
      delete_reason is null
      or delete_reason in (
        'user_deleted',
        'duress_purge',
        'fail_wipe_purge',
        'quota_cleanup',
        'expired',
        'replaced'
      )
    ),
  constraint mobile_spectre_backup_transfer_expiry_check
    check (backup_kind <> 'device_transfer' or expires_at is not null),
  constraint mobile_spectre_backup_state_check
    check (
      (status in ('deleted', 'expired', 'redeemed') and deleted_at is not null)
      or status not in ('deleted', 'expired', 'redeemed')
    )
);

create index if not exists mobile_spectre_backup_owner_idx
  on public.mobile_spectre_backup_manifests (
    user_id,
    wallet_address,
    backup_kind,
    status,
    created_at desc
  );
create index if not exists mobile_spectre_backup_expiry_idx
  on public.mobile_spectre_backup_manifests (expires_at)
  where expires_at is not null and status in ('pending', 'active');

create table if not exists public.mobile_spectre_backup_audit_events (
  id bigint generated always as identity primary key,
  user_id text not null,
  wallet_address text not null,
  manifest_id text,
  event_type text not null,
  result text not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint mobile_spectre_backup_audit_user_check
    check (length(user_id) between 8 and 256),
  constraint mobile_spectre_backup_audit_wallet_check
    check (wallet_address ~ '^EXO00[0-9a-f]{38}$'),
  constraint mobile_spectre_backup_audit_manifest_check
    check (
      manifest_id is null
      or manifest_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ),
  constraint mobile_spectre_backup_audit_event_check
    check (event_type in ('create_upload', 'complete', 'list', 'download', 'delete', 'purge_all')),
  constraint mobile_spectre_backup_audit_result_check
    check (result in ('success', 'denied', 'failed')),
  constraint mobile_spectre_backup_audit_reason_check
    check (reason is null or length(reason) <= 256)
);

create index if not exists mobile_spectre_backup_audit_wallet_idx
  on public.mobile_spectre_backup_audit_events (user_id, wallet_address, created_at desc);
create index if not exists mobile_spectre_backup_audit_retention_idx
  on public.mobile_spectre_backup_audit_events (created_at);

create table if not exists public.account_deletion_jobs (
  user_id text primary key,
  generation bigint not null default 1,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  postgres_deleted_at timestamptz,
  objects_deleted_at timestamptz,
  relay_deleted_at timestamptz,
  completed_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  next_retry_at timestamptz not null default now(),
  operation_token_hash text,
  operation_token_expires_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint account_deletion_jobs_user_check
    check (length(user_id) between 8 and 256),
  constraint account_deletion_jobs_generation_check
    check (generation > 0),
  constraint account_deletion_jobs_status_check
    check (status in ('pending', 'failed', 'completed')),
  constraint account_deletion_jobs_attempt_check
    check (attempt_count >= 0),
  constraint account_deletion_jobs_error_check
    check (last_error is null or length(last_error) <= 512),
  constraint account_deletion_jobs_operation_token_check
    check (
      (operation_token_hash is null and operation_token_expires_at is null)
      or (
        operation_token_hash ~ '^[0-9a-f]{64}$'
        and operation_token_expires_at > requested_at
      )
    ),
  constraint account_deletion_jobs_completion_check
    check (
      completed_at is null
      or (
        status = 'completed'
        and postgres_deleted_at is not null
        and objects_deleted_at is not null
        and relay_deleted_at is not null
      )
    )
);

create index if not exists account_deletion_jobs_retry_idx
  on public.account_deletion_jobs (next_retry_at, updated_at)
  where status in ('pending', 'failed');
create unique index if not exists account_deletion_jobs_operation_token_idx
  on public.account_deletion_jobs (operation_token_hash)
  where operation_token_hash is not null;

drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at
before update on public.support_tickets
for each row execute function spectra_private.set_updated_at();

drop trigger if exists object_records_set_updated_at on public.object_records;
create trigger object_records_set_updated_at
before update on public.object_records
for each row execute function spectra_private.set_updated_at();

drop trigger if exists mobile_spectre_backup_manifests_set_updated_at on public.mobile_spectre_backup_manifests;
create trigger mobile_spectre_backup_manifests_set_updated_at
before update on public.mobile_spectre_backup_manifests
for each row execute function spectra_private.set_updated_at();

drop trigger if exists account_deletion_jobs_set_updated_at on public.account_deletion_jobs;
create trigger account_deletion_jobs_set_updated_at
before update on public.account_deletion_jobs
for each row execute function spectra_private.set_updated_at();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'objects',
  'objects',
  false,
  104857600,
  array['application/octet-stream']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
