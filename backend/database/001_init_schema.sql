-- MedNova CRM MVP schema for Supabase PostgreSQL
-- This migration creates the simplified relational model for products, people,
-- leads, consultations, opportunities, activities, tasks, email history, files,
-- website events, and reporting views.

create extension if not exists pgcrypto;
create schema if not exists reporting;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_user_record_id()
returns uuid
language sql
stable
as $$
  select id
  from public.users
  where auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
as $$
  select r.slug
  from public.users u
  join public.roles r on r.id = u.role_id
  where u.id = public.current_user_record_id()
  limit 1;
$$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  product_type text not null default 'website' check (product_type in ('website','platform','service','product','other')),
  status text not null default 'active' check (status in ('active','inactive','archived')),
  website_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  role_id uuid not null references public.roles(id) on delete restrict,
  email text not null unique,
  first_name text not null,
  last_name text not null,
  display_name text,
  phone text,
  job_title text,
  avatar_url text,
  is_active boolean not null default true,
  timezone text not null default 'Africa/Lagos',
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_memberships (
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  is_active boolean not null default true,
  granted_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  organization_type text not null check (organization_type in ('company','hospital','government_agency','ngo','sponsor','university','other')),
  industry text,
  website_url text,
  phone text,
  email text,
  address_line1 text,
  city text,
  region text,
  country text,
  status text not null default 'active' check (status in ('active','inactive','prospect','former')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  job_title text,
  preferred_contact_method text default 'email' check (preferred_contact_method in ('email','phone','whatsapp','other')),
  status text not null default 'active' check (status in ('active','inactive','unsubscribed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  assigned_to uuid references public.users(id) on delete set null,
  source text not null default 'website' check (source in ('website','email','phone','referral','partner','integration','other')),
  lead_type text not null check (lead_type in ('consultation_booking','contact_form','proposal_request','regulatory_inquiry','pv_inquiry','cro_inquiry','download','integration','other')),
  title text not null,
  description text,
  status text not null default 'new' check (status in ('new','qualified','contacted','meeting_scheduled','proposal_sent','won','lost')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  source_url text,
  referrer_url text,
  submission_channel text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  lead_id uuid references public.leads(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  assigned_consultant_id uuid references public.users(id) on delete set null,
  title text not null,
  consultation_type text not null default 'discovery' check (consultation_type in ('discovery','strategy','proposal','follow_up','other')),
  scheduled_at timestamptz,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled','no_show','rescheduled')),
  meeting_link text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  lead_id uuid references public.leads(id) on delete set null,
  consultation_id uuid unique references public.consultations(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  owner_id uuid references public.users(id) on delete set null,
  name text not null,
  stage text not null default 'new' check (stage in ('new','qualified','consultation','proposal','negotiation','won','lost')),
  amount numeric(12,2),
  probability integer not null default 0 check (probability between 0 and 100),
  expected_close_date date,
  close_date date,
  next_step text,
  status text not null default 'active' check (status in ('active','won','lost','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  consultation_id uuid references public.consultations(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  actor_id uuid references public.users(id) on delete set null,
  activity_type text not null check (activity_type in ('call','email','meeting','note','website_submission','ai_interaction','task','system')),
  subject text not null,
  body text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  consultation_id uuid references public.consultations(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  assigned_to uuid references public.users(id) on delete set null,
  title text not null,
  description text,
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','cancelled','deferred')),
  due_at timestamptz,
  reminder_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  consultation_id uuid references public.consultations(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  sender_id uuid references public.users(id) on delete set null,
  direction text not null check (direction in ('outgoing','incoming')),
  from_email text,
  to_email text,
  cc_email text,
  subject text,
  body_text text,
  body_html text,
  status text not null default 'queued' check (status in ('queued','sent','delivered','failed','replied','opened')),
  provider text not null default 'resend',
  sent_at timestamptz,
  received_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  consultation_id uuid references public.consultations(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  uploaded_by uuid references public.users(id) on delete set null,
  file_name text not null,
  storage_bucket text not null default 'crm-files',
  storage_path text not null,
  mime_type text,
  file_size bigint,
  file_kind text not null default 'document' check (file_kind in ('document','capability_statement','proposal','contract','attachment','image','other')),
  description text,
  checksum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  session_identifier text,
  event_name text not null,
  page_url text,
  referrer text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_product_status_created on public.leads (product_id, status, created_at desc);
create index if not exists idx_leads_assigned_to on public.leads (assigned_to);
create index if not exists idx_leads_source_type on public.leads (source, lead_type);
create index if not exists idx_leads_metadata_gin on public.leads using gin (metadata);
create index if not exists idx_consultations_product_scheduled on public.consultations (product_id, scheduled_at);
create index if not exists idx_consultations_consultant on public.consultations (assigned_consultant_id);
create index if not exists idx_opportunities_product_stage on public.opportunities (product_id, stage, expected_close_date);
create index if not exists idx_opportunities_owner on public.opportunities (owner_id);
create index if not exists idx_activities_product_occurred on public.activities (product_id, occurred_at desc);
create index if not exists idx_activities_type on public.activities (activity_type);
create index if not exists idx_activities_metadata_gin on public.activities using gin (metadata);
create index if not exists idx_tasks_product_due on public.tasks (product_id, due_at);
create index if not exists idx_tasks_assigned_to on public.tasks (assigned_to, status);
create index if not exists idx_email_messages_product_created on public.email_messages (product_id, created_at desc);
create index if not exists idx_email_messages_status on public.email_messages (status);
create index if not exists idx_files_product_kind on public.files (product_id, file_kind);
create index if not exists idx_files_uploaded_by on public.files (uploaded_by);
create index if not exists idx_website_events_product_created on public.website_events (product_id, created_at desc);
create index if not exists idx_website_events_name on public.website_events (event_name);
create index if not exists idx_website_events_metadata_gin on public.website_events using gin (metadata);

create or replace view reporting.lead_pipeline_report as
select
  p.name as product_name,
  l.status,
  l.lead_type,
  l.priority,
  count(*) as lead_count,
  count(case when c.id is not null then 1 end) as consultation_count,
  count(case when o.id is not null then 1 end) as opportunity_count
from public.leads l
join public.products p on p.id = l.product_id
left join public.consultations c on c.lead_id = l.id
left join public.opportunities o on o.lead_id = l.id
group by p.name, l.status, l.lead_type, l.priority;

create or replace view reporting.product_activity_summary as
select
  p.name as product_name,
  a.activity_type,
  date_trunc('day', a.occurred_at) as activity_day,
  count(*) as activity_count
from public.activities a
join public.products p on p.id = a.product_id
group by p.name, a.activity_type, date_trunc('day', a.occurred_at)
order by activity_day desc;

alter table public.products enable row level security;
alter table public.roles enable row level security;
alter table public.users enable row level security;
alter table public.product_memberships enable row level security;
alter table public.organizations enable row level security;
alter table public.contacts enable row level security;
alter table public.leads enable row level security;
alter table public.consultations enable row level security;
alter table public.opportunities enable row level security;
alter table public.activities enable row level security;
alter table public.tasks enable row level security;
alter table public.email_messages enable row level security;
alter table public.files enable row level security;
alter table public.website_events enable row level security;

create policy if not exists "Allow service role full access to products" on public.products for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy if not exists "Allow authenticated users to read products" on public.products for select using (auth.uid() is not null and public.current_user_role() is not null);
create policy if not exists "Allow staff to manage products" on public.products for all using (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant')) with check (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant'));

create policy if not exists "Allow service role full access to roles" on public.roles for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy if not exists "Allow authenticated users to read roles" on public.roles for select using (auth.uid() is not null and public.current_user_role() is not null);
create policy if not exists "Allow admins to manage roles" on public.roles for all using (auth.uid() is not null and public.current_user_role() = 'admin') with check (auth.uid() is not null and public.current_user_role() = 'admin');

create policy if not exists "Allow service role full access to users" on public.users for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy if not exists "Allow authenticated users to read users" on public.users for select using (auth.uid() is not null and public.current_user_role() is not null);
create policy if not exists "Allow staff to manage users" on public.users for all using (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant')) with check (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant'));

create policy if not exists "Allow service role full access to product_memberships" on public.product_memberships for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy if not exists "Allow authenticated users to read memberships" on public.product_memberships for select using (auth.uid() is not null and public.current_user_role() is not null);
create policy if not exists "Allow admins to manage memberships" on public.product_memberships for all using (auth.uid() is not null and public.current_user_role() = 'admin') with check (auth.uid() is not null and public.current_user_role() = 'admin');

create policy if not exists "Allow service role full access to organizations" on public.organizations for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy if not exists "Allow authenticated users to read organizations" on public.organizations for select using (auth.uid() is not null and public.current_user_role() is not null);
create policy if not exists "Allow staff to manage organizations" on public.organizations for all using (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant')) with check (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant'));

create policy if not exists "Allow service role full access to contacts" on public.contacts for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy if not exists "Allow authenticated users to read contacts" on public.contacts for select using (auth.uid() is not null and public.current_user_role() is not null);
create policy if not exists "Allow staff to manage contacts" on public.contacts for all using (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant')) with check (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant'));

create policy if not exists "Allow service role full access to leads" on public.leads for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy if not exists "Allow authenticated users to read leads" on public.leads for select using (auth.uid() is not null and public.current_user_role() is not null);
create policy if not exists "Allow staff to manage leads" on public.leads for all using (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant')) with check (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant'));

create policy if not exists "Allow service role full access to consultations" on public.consultations for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy if not exists "Allow authenticated users to read consultations" on public.consultations for select using (auth.uid() is not null and public.current_user_role() is not null);
create policy if not exists "Allow staff to manage consultations" on public.consultations for all using (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant')) with check (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant'));

create policy if not exists "Allow service role full access to opportunities" on public.opportunities for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy if not exists "Allow authenticated users to read opportunities" on public.opportunities for select using (auth.uid() is not null and public.current_user_role() is not null);
create policy if not exists "Allow staff to manage opportunities" on public.opportunities for all using (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant')) with check (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant'));

create policy if not exists "Allow service role full access to activities" on public.activities for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy if not exists "Allow authenticated users to read activities" on public.activities for select using (auth.uid() is not null and public.current_user_role() is not null);
create policy if not exists "Allow staff to manage activities" on public.activities for all using (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant')) with check (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant'));

create policy if not exists "Allow service role full access to tasks" on public.tasks for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy if not exists "Allow authenticated users to read tasks" on public.tasks for select using (auth.uid() is not null and public.current_user_role() is not null);
create policy if not exists "Allow staff to manage tasks" on public.tasks for all using (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant')) with check (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant'));

create policy if not exists "Allow service role full access to email messages" on public.email_messages for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy if not exists "Allow authenticated users to read email messages" on public.email_messages for select using (auth.uid() is not null and public.current_user_role() is not null);
create policy if not exists "Allow staff to manage email messages" on public.email_messages for all using (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant')) with check (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant'));

create policy if not exists "Allow service role full access to files" on public.files for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy if not exists "Allow authenticated users to read files" on public.files for select using (auth.uid() is not null and public.current_user_role() is not null);
create policy if not exists "Allow staff to manage files" on public.files for all using (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant')) with check (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant'));

create policy if not exists "Allow service role full access to website events" on public.website_events for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy if not exists "Allow authenticated users to read website events" on public.website_events for select using (auth.uid() is not null and public.current_user_role() is not null);
create policy if not exists "Allow staff to manage website events" on public.website_events for all using (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant')) with check (auth.uid() is not null and public.current_user_role() in ('admin','sales','consultant'));

create trigger trg_products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger trg_roles_updated_at before update on public.roles for each row execute function public.set_updated_at();
create trigger trg_users_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger trg_product_memberships_updated_at before update on public.product_memberships for each row execute function public.set_updated_at();
create trigger trg_organizations_updated_at before update on public.organizations for each row execute function public.set_updated_at();
create trigger trg_contacts_updated_at before update on public.contacts for each row execute function public.set_updated_at();
create trigger trg_leads_updated_at before update on public.leads for each row execute function public.set_updated_at();
create trigger trg_consultations_updated_at before update on public.consultations for each row execute function public.set_updated_at();
create trigger trg_opportunities_updated_at before update on public.opportunities for each row execute function public.set_updated_at();
create trigger trg_activities_updated_at before update on public.activities for each row execute function public.set_updated_at();
create trigger trg_tasks_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger trg_email_messages_updated_at before update on public.email_messages for each row execute function public.set_updated_at();
create trigger trg_files_updated_at before update on public.files for each row execute function public.set_updated_at();
create trigger trg_website_events_updated_at before update on public.website_events for each row execute function public.set_updated_at();
