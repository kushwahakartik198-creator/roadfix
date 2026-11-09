-- RoadFix Phase 2A: Migration 1 of 8
-- Enums and Core Application Tables

-- 1. Extensions (ensure pgcrypto is available in extensions schema)
create extension if not exists pgcrypto with schema extensions;

-- 2. Enumerated Types
create type public.app_role as enum ('citizen', 'officer', 'admin');
create type public.complaint_status as enum ('submitted', 'under_review', 'verified', 'in_progress', 'resolved', 'rejected');
create type public.severity_level as enum ('low', 'medium', 'high');
create type public.image_kind as enum ('report', 'repair_evidence');
create type public.history_event as enum ('created', 'status_change', 'assignment', 'reopened');

-- 3. Profiles table
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. User roles table (single role per user, default citizen)
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'citizen'::public.app_role,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);

-- 5. Complaints table
create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^RF-[A-Z]{2,3}-[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$'),
  reporter_id uuid references auth.users(id) on delete set null,
  description text not null check (char_length(btrim(description)) between 10 and 1000),
  latitude double precision not null check (latitude between -90.0 and 90.0),
  longitude double precision not null check (longitude between -180.0 and 180.0),
  location_description text check (location_description is null or char_length(btrim(location_description)) <= 150),
  city_code text not null default 'AG' check (city_code ~ '^[A-Z]{2,3}$'),
  city_name text not null default 'Agra',
  status public.complaint_status not null default 'submitted'::public.complaint_status,
  status_updated_at timestamptz not null default now(),
  severity public.severity_level,
  assigned_officer_id uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  rejection_reason text,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint complaints_rejection_reason_check check (status != 'rejected' or rejection_reason is not null),
  constraint complaints_resolution_check check (status != 'resolved' or (resolution_note is not null and resolved_at is not null))
);

-- 6. Complaint images table
create table public.complaint_images (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete restrict,
  uploaded_by uuid references auth.users(id) on delete set null,
  kind public.image_kind not null,
  slot smallint,
  storage_path text not null unique check (storage_path ~ '^[0-9a-fA-F-]{36}/(report|evidence)/[0-9a-fA-F-]{36}\.[a-zA-Z0-9]+$'),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 5242880),
  created_at timestamptz not null default now(),
  constraint complaint_images_kind_slot_check check (
    (kind = 'report' and slot between 1 and 3) or
    (kind = 'repair_evidence' and slot is null)
  )
);

-- 7. Complaint status history table (immutable audit trail)
create table public.complaint_status_history (
  id bigint generated always as identity primary key,
  complaint_id uuid not null references public.complaints(id) on delete restrict,
  event_type public.history_event not null,
  from_status public.complaint_status,
  to_status public.complaint_status,
  assignee_id uuid references auth.users(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role public.app_role not null,
  note text,
  created_at timestamptz not null default now()
);

-- 8. Admin audit log table
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(btrim(action)) between 3 and 100),
  target_complaint_id uuid references public.complaints(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
