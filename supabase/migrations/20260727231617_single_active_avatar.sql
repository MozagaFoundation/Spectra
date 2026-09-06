create unique index if not exists object_records_one_active_public_avatar_per_owner_idx
on public.object_records (owner_user_id)
where purpose = 'public_avatar' and lifecycle = 'active';
