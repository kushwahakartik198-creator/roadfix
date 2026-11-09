-- RoadFix Phase 2A: Migration 6 of 8
-- Application RPCs (Public Schema, Security Definer)

-- 1. submit_complaint
create or replace function public.submit_complaint(
  p_description text,
  p_latitude double precision,
  p_longitude double precision,
  p_location_description text default null
)
returns table (id uuid, reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.app_role;
  v_desc text;
  v_loc text;
  v_count integer;
  v_id uuid;
  v_ref text;
  v_retry_count integer := 0;
begin
  -- Authentication check
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Role check: citizens only
  v_role := private.current_app_role();
  if v_role != 'citizen'::public.app_role then
    raise exception 'Only citizens can submit complaints' using errcode = '42501';
  end if;

  -- Description validation (10 to 1000 characters after trim)
  v_desc := btrim(coalesce(p_description, ''));
  if char_length(v_desc) < 10 or char_length(v_desc) > 1000 then
    raise exception 'Description must be between 10 and 1000 characters' using errcode = '22000';
  end if;

  -- Latitude and longitude range checks (-90 to 90 and -180 to 180)
  if p_latitude is null or p_latitude < -90.0 or p_latitude > 90.0 or
     p_longitude is null or p_longitude < -180.0 or p_longitude > 180.0 then
    raise exception 'Location coordinates must be between -90 and 90 for latitude and -180 and 180 for longitude' using errcode = '22000';
  end if;

  -- Location description validation (best-effort PII guard: max 150 chars, no '@', no 7+ digits)
  if p_location_description is not null then
    v_loc := btrim(p_location_description);
    if v_loc != '' then
      if char_length(v_loc) > 150 then
        raise exception 'Location description must be at most 150 characters' using errcode = '22000';
      end if;
      if v_loc like '%@%' or v_loc ~ '[0-9]{7,}' then
        raise exception 'Location description must not contain email addresses or phone numbers' using errcode = '22000';
      end if;
    else
      v_loc := null;
    end if;
  else
    v_loc := null;
  end if;

  -- Concurrency-safe rate limit: advisory transaction lock on user ID
  perform pg_advisory_xact_lock(hashtext('complaint_submission_' || v_uid::text));

  select count(*)::integer into v_count
  from public.complaints c
  where c.reporter_id = v_uid
    and c.created_at >= (clock_timestamp() - interval '24 hours');

  if v_count >= 10 then
    raise exception 'Daily submission limit reached (maximum 10 complaints per 24 hours)' using errcode = 'P0001';
  end if;

  -- Generate unique complaint reference with CSPRNG and bounded retry on collision during insertion
  loop
    v_retry_count := v_retry_count + 1;
    v_ref := private.generate_complaint_reference('AG');

    begin
      -- Insert complaint
      insert into public.complaints (
        reference,
        reporter_id,
        description,
        latitude,
        longitude,
        location_description,
        city_code,
        city_name,
        status,
        status_updated_at,
        created_at,
        updated_at
      ) values (
        v_ref,
        v_uid,
        v_desc,
        p_latitude,
        p_longitude,
        v_loc,
        'AG',
        'Agra',
        'submitted'::public.complaint_status,
        now(),
        now(),
        now()
      ) returning public.complaints.id into v_id;

      exit;
    exception
      when unique_violation then
        if sqlerrm like '%reference%' or sqlstate = '23505' then
          if v_retry_count >= 5 then
            raise exception 'Could not generate unique complaint reference after 5 attempts' using errcode = 'P0001';
          end if;
        else
          raise;
        end if;
    end;
  end loop;

  -- Insert initial status history record (actor_id is null for citizen actions to protect reporter privacy)
  insert into public.complaint_status_history (
    complaint_id,
    event_type,
    from_status,
    to_status,
    assignee_id,
    actor_id,
    actor_role,
    note,
    created_at
  ) values (
    v_id,
    'created'::public.history_event,
    null,
    'submitted'::public.complaint_status,
    null,
    null,
    'citizen'::public.app_role,
    null,
    now()
  );

  return query select v_id, v_ref;
end;
$$;

-- 2. register_complaint_image
create or replace function public.register_complaint_image(
  p_complaint_id uuid,
  p_storage_path text,
  p_kind public.image_kind
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.app_role;
  v_comp record;
  v_obj record;
  v_slot smallint;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_complaint_id is null or p_storage_path is null or p_kind is null then
    raise exception 'Invalid arguments' using errcode = '22000';
  end if;

  -- Serialize registrations on this complaint by acquiring a row lock
  select c.id, c.reporter_id, c.assigned_officer_id, c.status
  into v_comp
  from public.complaints c
  where c.id = p_complaint_id
  for update;

  if not found then
    raise exception 'Complaint not found' using errcode = 'P0002';
  end if;

  v_role := private.current_app_role();

  -- Verify object exists in storage.objects (complaint-images bucket)
  select o.name, o.owner_id::text as owner_id, (o.metadata->>'size')::bigint as size, (o.metadata->>'mimetype')::text as mimetype
  into v_obj
  from storage.objects o
  where o.bucket_id = 'complaint-images'
    and o.name = p_storage_path;

  if not found then
    raise exception 'Storage object not found in complaint-images bucket' using errcode = 'P0002';
  end if;

  -- Owner of storage object must match the caller (NULL-safe check; NULL ownership is strictly rejected)
  if v_obj.owner_id is null or v_obj.owner_id is distinct from v_uid::text then
    raise exception 'Storage object owner does not match caller' using errcode = '42501';
  end if;

  -- Authoritative validation of storage metadata derived directly from storage.objects
  if v_obj.mimetype not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Invalid image MIME type: %', v_obj.mimetype using errcode = '22000';
  end if;

  if v_obj.size is null or v_obj.size < 1 or v_obj.size > 5242880 then
    raise exception 'Invalid image file size: must be between 1 and 5242880 bytes' using errcode = '22000';
  end if;

  -- Path pattern verification
  if p_storage_path !~ '^[0-9a-fA-F-]{36}/(report|evidence)/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$' then
    raise exception 'Invalid storage path format' using errcode = '22000';
  end if;

  -- Branch logic by kind
  if p_kind = 'report'::public.image_kind then
    -- Only the reporter can register report images
    if v_comp.reporter_id is null or v_comp.reporter_id != v_uid then
      raise exception 'Only the complaint reporter can register report images' using errcode = '42501';
    end if;

    -- Report images can only be added while status is submitted
    if v_comp.status != 'submitted'::public.complaint_status then
      raise exception 'Report images can only be added when status is submitted' using errcode = 'P0001';
    end if;

    -- Storage path prefix must match complaint ID
    if p_storage_path !~ ('^' || p_complaint_id::text || '/report/') then
      raise exception 'Storage path prefix does not match complaint ID' using errcode = '22000';
    end if;

    -- Allocate the lowest available slot (1..3) under row lock
    select s.slot into v_slot
    from generate_series(1, 3) as s(slot)
    where not exists (
      select 1
      from public.complaint_images ci
      where ci.complaint_id = p_complaint_id
        and ci.kind = 'report'::public.image_kind
        and ci.slot = s.slot
    )
    order by s.slot asc
    limit 1;

    if v_slot is null then
      raise exception 'Image limit reached (maximum 3 report images allowed)' using errcode = 'P0001';
    end if;

  elsif p_kind = 'repair_evidence'::public.image_kind then
    -- Only the assigned officer or admin can register repair evidence
    if not (
      v_role = 'admin'::public.app_role or
      (v_role = 'officer'::public.app_role and v_comp.assigned_officer_id = v_uid)
    ) then
      raise exception 'Only the assigned officer or admin can register repair evidence' using errcode = '42501';
    end if;

    -- Repair evidence can only be registered while in_progress
    if v_comp.status != 'in_progress'::public.complaint_status then
      raise exception 'Repair evidence can only be registered when status is in_progress' using errcode = 'P0001';
    end if;

    -- Storage path prefix must match complaint ID
    if p_storage_path !~ ('^' || p_complaint_id::text || '/evidence/') then
      raise exception 'Storage path prefix does not match complaint ID' using errcode = '22000';
    end if;

    v_slot := null;
  else
    raise exception 'Unsupported image kind' using errcode = '22000';
  end if;

  -- Insert complaint image record
  begin
    insert into public.complaint_images (
      complaint_id,
      uploaded_by,
      kind,
      slot,
      storage_path,
      content_type,
      size_bytes,
      created_at
    ) values (
      p_complaint_id,
      v_uid,
      p_kind,
      v_slot,
      p_storage_path,
      v_obj.mimetype,
      v_obj.size,
      now()
    ) returning public.complaint_images.id into v_new_id;

    return v_new_id;
  exception
    when unique_violation then
      if sqlerrm like '%storage_path%' then
        raise exception 'Storage path has already been registered' using errcode = '23505';
      else
        raise exception 'Image limit reached (slot conflict)' using errcode = '23505';
      end if;
  end;
end;
$$;

-- 3. transition_complaint_status
create or replace function public.transition_complaint_status(
  p_complaint_id uuid,
  p_to_status public.complaint_status,
  p_note text default null,
  p_severity public.severity_level default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.app_role;
  v_comp record;
  v_event_type public.history_event := 'status_change'::public.history_event;
  v_rejection_reason text;
  v_resolution_note text;
  v_resolved_at timestamptz;
  v_severity public.severity_level;
  v_note_clean text;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_role := private.current_app_role();
  if v_role = 'citizen'::public.app_role then
    raise exception 'Citizens cannot transition complaint status' using errcode = '42501';
  end if;

  -- Lock complaint row
  select * into v_comp
  from public.complaints
  where id = p_complaint_id
  for update;

  if not found then
    raise exception 'Complaint not found' using errcode = 'P0002';
  end if;

  v_note_clean := btrim(coalesce(p_note, ''));
  if v_note_clean = '' then
    v_note_clean := null;
  end if;

  -- Retain existing values by default
  v_rejection_reason := v_comp.rejection_reason;
  v_resolution_note := v_comp.resolution_note;
  v_resolved_at := v_comp.resolved_at;
  v_severity := v_comp.severity;

  -- Enforce transition matrix
  if v_comp.status = 'submitted'::public.complaint_status and p_to_status = 'under_review'::public.complaint_status then
    -- submitted -> under_review (officer/admin)
    null;

  elsif v_comp.status = 'under_review'::public.complaint_status and p_to_status = 'verified'::public.complaint_status then
    -- under_review -> verified (officer/admin; severity required)
    if p_severity is null then
      raise exception 'Severity is required when verifying a complaint' using errcode = 'P0001';
    end if;
    v_severity := p_severity;

  elsif v_comp.status in ('submitted'::public.complaint_status, 'under_review'::public.complaint_status, 'verified'::public.complaint_status)
        and p_to_status = 'rejected'::public.complaint_status then
    -- submitted|under_review|verified -> rejected (officer/admin; note required as rejection_reason)
    if v_note_clean is null then
      raise exception 'A rejection reason is required when rejecting a complaint' using errcode = 'P0001';
    end if;
    v_rejection_reason := v_note_clean;

  elsif v_comp.status = 'verified'::public.complaint_status and p_to_status = 'in_progress'::public.complaint_status then
    -- verified -> in_progress (assigned officer or admin; assigned_officer_id must be set)
    if v_comp.assigned_officer_id is null then
      raise exception 'Complaint must be assigned to an officer before entering in_progress status' using errcode = 'P0001';
    end if;

    if v_role = 'officer'::public.app_role and v_comp.assigned_officer_id != v_uid then
      raise exception 'Only the assigned officer or admin can start work on this complaint' using errcode = '42501';
    end if;

  elsif v_comp.status = 'in_progress'::public.complaint_status and p_to_status = 'resolved'::public.complaint_status then
    -- in_progress -> resolved (assigned officer or admin; resolution note required)
    if v_role = 'officer'::public.app_role and v_comp.assigned_officer_id != v_uid then
      raise exception 'Only the assigned officer or admin can resolve this complaint' using errcode = '42501';
    end if;

    if v_note_clean is null then
      raise exception 'A resolution note is required when resolving a complaint' using errcode = 'P0001';
    end if;

    v_resolution_note := v_note_clean;
    v_resolved_at := now();

  elsif v_comp.status = 'rejected'::public.complaint_status and p_to_status = 'submitted'::public.complaint_status then
    -- rejected -> submitted (admin only; note required; event_type reopened; clear rejection_reason)
    if v_role != 'admin'::public.app_role then
      raise exception 'Only admins can reopen a rejected complaint' using errcode = '42501';
    end if;

    if v_note_clean is null then
      raise exception 'A note is required when reopening a rejected complaint' using errcode = 'P0001';
    end if;

    v_event_type := 'reopened'::public.history_event;
    v_rejection_reason := null;

  elsif v_comp.status = 'resolved'::public.complaint_status and p_to_status = 'in_progress'::public.complaint_status then
    -- resolved -> in_progress (admin only; note required; assigned_officer_id must be set; event_type reopened; clear resolution)
    if v_role != 'admin'::public.app_role then
      raise exception 'Only admins can reopen a resolved complaint' using errcode = '42501';
    end if;

    if v_comp.assigned_officer_id is null then
      raise exception 'Complaint must have an assigned officer before reopening into in_progress' using errcode = 'P0001';
    end if;

    if v_note_clean is null then
      raise exception 'A note is required when reopening a resolved complaint' using errcode = 'P0001';
    end if;

    v_event_type := 'reopened'::public.history_event;
    v_resolution_note := null;
    v_resolved_at := null;

  else
    raise exception 'Invalid status transition from % to %', v_comp.status, p_to_status using errcode = 'P0001';
  end if;

  -- Apply updates to complaints row
  update public.complaints
  set
    status = p_to_status,
    status_updated_at = now(),
    severity = v_severity,
    rejection_reason = v_rejection_reason,
    resolution_note = v_resolution_note,
    resolved_at = v_resolved_at,
    updated_at = now()
  where id = p_complaint_id;

  -- Insert history record
  insert into public.complaint_status_history (
    complaint_id,
    event_type,
    from_status,
    to_status,
    assignee_id,
    actor_id,
    actor_role,
    note,
    created_at
  ) values (
    p_complaint_id,
    v_event_type,
    v_comp.status,
    p_to_status,
    v_comp.assigned_officer_id,
    v_uid,
    v_role,
    v_note_clean,
    now()
  );
end;
$$;

-- 4. assign_complaint
create or replace function public.assign_complaint(
  p_complaint_id uuid,
  p_officer_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.app_role;
  v_comp record;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_role := private.current_app_role();
  if v_role != 'admin'::public.app_role then
    raise exception 'Only admins can assign complaints' using errcode = '42501';
  end if;

  if p_complaint_id is null or p_officer_id is null then
    raise exception 'Complaint ID and Officer ID are required' using errcode = '22000';
  end if;

  -- Lock complaint row
  select * into v_comp
  from public.complaints
  where id = p_complaint_id
  for update;

  if not found then
    raise exception 'Complaint not found' using errcode = 'P0002';
  end if;

  -- Target user must hold 'officer' role
  if not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p_officer_id
      and ur.role = 'officer'::public.app_role
  ) then
    raise exception 'Target user does not have officer role' using errcode = 'P0001';
  end if;

  -- Status must be verified or in_progress (reassignment permitted)
  if v_comp.status not in ('verified'::public.complaint_status, 'in_progress'::public.complaint_status) then
    raise exception 'Complaints can only be assigned in verified or in_progress status' using errcode = 'P0001';
  end if;

  -- Update assignment fields (status remains untouched)
  update public.complaints
  set
    assigned_officer_id = p_officer_id,
    assigned_at = now(),
    updated_at = now()
  where id = p_complaint_id;

  -- Insert history record with event_type 'assignment'
  insert into public.complaint_status_history (
    complaint_id,
    event_type,
    from_status,
    to_status,
    assignee_id,
    actor_id,
    actor_role,
    note,
    created_at
  ) values (
    p_complaint_id,
    'assignment'::public.history_event,
    v_comp.status,
    v_comp.status,
    p_officer_id,
    v_uid,
    'admin'::public.app_role,
    null,
    now()
  );
end;
$$;

-- 5. admin_set_role
create or replace function public.admin_set_role(
  p_user_id uuid,
  p_role public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.app_role;
  v_target_role public.app_role;
  v_admin_count integer;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_role := private.current_app_role();
  if v_role != 'admin'::public.app_role then
    raise exception 'Only admins can set user roles' using errcode = '42501';
  end if;

  if p_user_id is null or p_role is null then
    raise exception 'User ID and Role are required' using errcode = '22000';
  end if;

  -- Advisory lock prevents concurrent last-admin demotions
  perform pg_advisory_xact_lock(hashtext('admin_role_change'));

  -- Verify target user exists
  select ur.role into v_target_role
  from public.user_roles ur
  where ur.user_id = p_user_id;

  if not found then
    raise exception 'Target user not found' using errcode = 'P0002';
  end if;

  -- If demoting an admin, ensure they are not the last admin
  if v_target_role = 'admin'::public.app_role and p_role != 'admin'::public.app_role then
    select count(*)::integer into v_admin_count
    from public.user_roles
    where role = 'admin'::public.app_role;

    if v_admin_count <= 1 then
      raise exception 'Cannot demote the last remaining admin' using errcode = 'P0001';
    end if;
  end if;

  -- Update target user's role
  update public.user_roles
  set
    role = p_role,
    granted_by = v_uid,
    granted_at = now()
  where user_id = p_user_id;

  -- Record in admin audit log
  insert into public.admin_audit_log (
    admin_id,
    action,
    target_complaint_id,
    target_user_id,
    details,
    created_at
  ) values (
    v_uid,
    'set_role',
    null,
    p_user_id,
    jsonb_build_object('old_role', v_target_role, 'new_role', p_role),
    now()
  );
end;
$$;

-- 6. admin_get_reporter
create or replace function public.admin_get_reporter(
  p_complaint_id uuid
)
returns table (reporter_id uuid, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.app_role;
  v_reporter_id uuid;
  v_display_name text;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_role := private.current_app_role();
  if v_role != 'admin'::public.app_role then
    raise exception 'Only admins can view reporter details' using errcode = '42501';
  end if;

  if p_complaint_id is null then
    raise exception 'Complaint ID is required' using errcode = '22000';
  end if;

  select c.reporter_id, p.display_name
  into v_reporter_id, v_display_name
  from public.complaints c
  left join public.profiles p on p.id = c.reporter_id
  where c.id = p_complaint_id;

  if not found then
    raise exception 'Complaint not found' using errcode = 'P0002';
  end if;

  -- Record audit log entry on every access
  insert into public.admin_audit_log (
    admin_id,
    action,
    target_complaint_id,
    target_user_id,
    details,
    created_at
  ) values (
    v_uid,
    'get_reporter',
    p_complaint_id,
    v_reporter_id,
    '{}'::jsonb,
    now()
  );

  return query select v_reporter_id, v_display_name;
end;
$$;

-- 7. track_complaint
create or replace function public.track_complaint(
  p_reference text
)
returns table (
  reference text,
  status public.complaint_status,
  submitted_at timestamptz,
  status_updated_at timestamptz,
  location_description text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_norm text;
begin
  -- Normalize input: trim and uppercase
  v_norm := upper(btrim(coalesce(p_reference, '')));

  -- Validate format strictly. If invalid, return empty set (no errors leaked to unauthenticated callers)
  if v_norm !~ '^RF-[A-Z]{2,3}-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$' then
    return;
  end if;

  -- Return public-safe tracking fields only
  return query
  select
    c.reference,
    c.status,
    c.created_at as submitted_at,
    c.status_updated_at,
    c.location_description
  from public.complaints c
  where c.reference = v_norm;
end;
$$;

-- Function Execution Privileges
revoke execute on function public.submit_complaint(text, double precision, double precision, text) from public, anon, authenticated;
grant execute on function public.submit_complaint(text, double precision, double precision, text) to authenticated;

revoke execute on function public.register_complaint_image(uuid, text, public.image_kind) from public, anon, authenticated;
grant execute on function public.register_complaint_image(uuid, text, public.image_kind) to authenticated;

revoke execute on function public.transition_complaint_status(uuid, public.complaint_status, text, public.severity_level) from public, anon, authenticated;
grant execute on function public.transition_complaint_status(uuid, public.complaint_status, text, public.severity_level) to authenticated;

revoke execute on function public.assign_complaint(uuid, uuid) from public, anon, authenticated;
grant execute on function public.assign_complaint(uuid, uuid) to authenticated;

revoke execute on function public.admin_set_role(uuid, public.app_role) from public, anon, authenticated;
grant execute on function public.admin_set_role(uuid, public.app_role) to authenticated;

revoke execute on function public.admin_get_reporter(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_reporter(uuid) to authenticated;

revoke execute on function public.track_complaint(text) from public, anon, authenticated;
grant execute on function public.track_complaint(text) to anon, authenticated;
