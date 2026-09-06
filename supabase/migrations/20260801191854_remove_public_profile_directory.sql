delete from public.mobile_app_records
where record_table = 'public_profiles';

update public.object_records
set lifecycle = 'deletion_pending',
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
where purpose = 'public_avatar'
  and lifecycle in ('pending', 'active');

drop index if exists public.object_records_one_active_public_avatar_per_owner_idx;
