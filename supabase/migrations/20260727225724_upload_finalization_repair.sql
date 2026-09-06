with verified_objects as (
  select records.object_ref
  from public.object_records records
  join storage.objects objects
    on objects.bucket_id = 'objects'
    and objects.name = records.object_key
  where records.lifecycle = 'pending'
    and coalesce((objects.metadata->>'size')::bigint, -1) = records.declared_size
)
update public.object_records records
set lifecycle = 'active',
    uploaded_at = coalesce(records.uploaded_at, now()),
    updated_at = now()
from verified_objects
where records.object_ref = verified_objects.object_ref;

update public.object_records
set retention_expires_at = coalesce(retention_expires_at, now() + interval '1 hour'),
    updated_at = now()
where purpose = 'public_avatar'
  and lifecycle = 'pending';

update public.object_records objects
set retention_expires_at = null,
    updated_at = now()
from public.mobile_app_records records
where records.record_table = 'public_profiles'
  and objects.object_ref = records.body->>'avatarUrl'
  and objects.owner_user_id = records.owner_user_id
  and objects.purpose = 'public_avatar'
  and objects.lifecycle = 'active';

with current_avatars as (
  select distinct on (records.owner_user_id)
    records.owner_user_id,
    records.body->>'avatarUrl' as object_ref
  from public.mobile_app_records records
  join public.object_records current_object
    on current_object.object_ref = records.body->>'avatarUrl'
    and current_object.owner_user_id = records.owner_user_id
    and current_object.purpose = 'public_avatar'
    and current_object.lifecycle = 'active'
  where records.record_table = 'public_profiles'
    and nullif(records.body->>'avatarUrl', '') is not null
  order by records.owner_user_id, records.updated_at desc
)
update public.object_records objects
set lifecycle = 'deletion_pending',
    deleted_at = coalesce(objects.deleted_at, now()),
    updated_at = now()
from current_avatars
where objects.owner_user_id = current_avatars.owner_user_id
  and objects.purpose = 'public_avatar'
  and objects.lifecycle = 'active'
  and objects.object_ref <> current_avatars.object_ref;
