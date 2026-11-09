-- RoadFix Phase 2A: Migration 8 of 8
-- Storage Bucket and Storage Object Policies

-- 1. Create or verify complaint-images bucket (private, 5MB limit, JPEG/PNG/WebP only)
-- Do not silently accept an existing bucket with incompatible configuration.
do $$
declare
  v_bucket record;
begin
  select * into v_bucket from storage.buckets where id = 'complaint-images';
  if not found then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'complaint-images',
      'complaint-images',
      false,
      5242880,
      array['image/jpeg', 'image/png', 'image/webp']
    );
  else
    -- Verify compatibility of existing bucket
    if coalesce(v_bucket.public, true) != false or
       coalesce(v_bucket.file_size_limit, 0) != 5242880 or
       v_bucket.allowed_mime_types is null or
       not (
         v_bucket.allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']::text[]
         and v_bucket.allowed_mime_types <@ array['image/jpeg', 'image/png', 'image/webp']::text[]
       ) then
      raise exception 'Existing storage bucket "complaint-images" has incompatible configuration (must be private, file_size_limit 5242880, allowed_mime_types image/jpeg, image/png, image/webp)'
        using errcode = '55000';
    end if;
  end if;
end;
$$;

-- 2. Storage Policies on storage.objects
-- Note: Do NOT alter storage.objects table grants or RLS state; attach only named roadfix_* policies.

-- Policy 1: INSERT report images
-- Guard conditions:
-- - Bucket is complaint-images
-- - Name conforms strictly to <complaint_id>/report/<image_id>.<ext>
-- - Caller is the complaint's reporter
-- - Complaint status is currently 'submitted'
-- - Best-effort check: fewer than 3 existing storage objects in this report folder
create policy roadfix_complaint_images_insert_report on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'complaint-images'
    and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/report/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(jpg|jpeg|png|webp)$'
    and private.is_reporter((split_part(name, '/', 1))::uuid)
    and exists (
      select 1
      from public.complaints c
      where c.id = (split_part(name, '/', 1))::uuid
        and c.status = 'submitted'::public.complaint_status
    )
    and private.count_report_storage_objects((split_part(name, '/', 1))::uuid) < 3
  );

-- Policy 2: INSERT evidence images
-- Guard conditions:
-- - Bucket is complaint-images
-- - Name conforms strictly to <complaint_id>/evidence/<image_id>.<ext>
-- - Complaint status is currently 'in_progress'
-- - Caller is the assigned officer or an admin
create policy roadfix_complaint_images_insert_evidence on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'complaint-images'
    and name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/evidence/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(jpg|jpeg|png|webp)$'
    and exists (
      select 1
      from public.complaints c
      where c.id = (split_part(name, '/', 1))::uuid
        and c.status = 'in_progress'::public.complaint_status
        and (
          private.current_app_role() = 'admin'::public.app_role
          or (
            private.current_app_role() = 'officer'::public.app_role
            and c.assigned_officer_id = (select auth.uid())
          )
        )
    )
  );

-- Policy 3: SELECT complaint images
-- Guard conditions:
-- - Bucket is complaint-images
-- - First path segment is a valid UUID
-- - Caller is authorized to view the complaint via private.can_view_complaint()
create policy roadfix_complaint_images_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'complaint-images'
    and split_part(name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and private.can_view_complaint((split_part(name, '/', 1))::uuid)
  );
