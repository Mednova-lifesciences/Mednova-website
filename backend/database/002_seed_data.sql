-- Seed data for the MedNova CRM MVP

insert into public.roles (id, name, slug, description)
values
  ('22222222-2222-2222-2222-222222222222', 'Admin', 'admin', 'Full access to the CRM and configuration.'),
  ('33333333-3333-3333-3333-333333333333', 'Sales', 'sales', 'Manages leads, consultations, and opportunities.'),
  ('44444444-4444-4444-4444-444444444444', 'Consultant', 'consultant', 'Owns consultation delivery and follow-up.'),
  ('55555555-5555-5555-5555-555555555555', 'Viewer', 'viewer', 'Read-only access to CRM records.')
on conflict (id) do nothing;

insert into public.products (id, name, slug, description, product_type, status, website_url)
values
  ('11111111-1111-1111-1111-111111111111', 'MedNova Lifesciences Website', 'mednova-website', 'Primary website and lead capture platform for MedNova Lifesciences.', 'website', 'active', 'https://mednovalife.com')
on conflict (id) do nothing;

insert into public.users (id, auth_user_id, role_id, email, first_name, last_name, display_name, phone, job_title, is_active)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'admin@mednovalife.com', 'Ada', 'Okafor', 'Ada Okafor', '+2348010000001', 'Head of Growth', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'sarah@mednovalife.com', 'Sarah', 'Ibrahim', 'Sarah Ibrahim', '+2348020000002', 'Sales Lead', true),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'cccccccc-cccc-cccc-cccc-cccccccccccc', '44444444-4444-4444-4444-444444444444', 'maria@mednovalife.com', 'Maria', 'Eze', 'Maria Eze', '+2348040000004', 'Consultant', true)
on conflict (id) do nothing;

insert into public.product_memberships (user_id, product_id, role_id, is_active)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', true),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', true)
on conflict do nothing;

insert into public.organizations (id, name, slug, organization_type, industry, website_url, phone, email, city, region, country, status)
values
  ('11111112-1111-1111-1111-111111111111', 'BioNova Therapeutics', 'bionova-therapeutics', 'company', 'Biotechnology', 'https://bionova.example', '+2348012345678', 'ops@bionova.example', 'Lagos', 'Lagos', 'Nigeria', 'active'),
  ('11111113-1111-1111-1111-111111111112', 'Lagos University Teaching Hospital', 'lagos-university-teaching-hospital', 'hospital', 'Healthcare', 'https://luth.gov.ng', '+2348023456789', 'research@luth.gov.ng', 'Lagos', 'Lagos', 'Nigeria', 'active'),
  ('11111114-1111-1111-1111-111111111113', 'Federal Ministry of Health Nigeria', 'federal-ministry-of-health-nigeria', 'government_agency', 'Government', 'https://health.gov.ng', '+2348034567890', 'regulatory@health.gov.ng', 'Abuja', 'FCT', 'Nigeria', 'active')
on conflict (id) do nothing;

insert into public.contacts (id, organization_id, first_name, last_name, email, phone, job_title, preferred_contact_method, status)
values
  ('22222223-2222-2222-2222-222222222222', '11111112-1111-1111-1111-111111111111', 'Grace', 'Akinyemi', 'grace@bionova.example', '+2348060000001', 'Head of Clinical Development', 'email', 'active'),
  ('22222224-2222-2222-2222-222222222223', '11111113-1111-1111-1111-111111111112', 'Bola', 'Ogunleye', 'bola@luth.gov.ng', '+2348060000002', 'Research Coordinator', 'phone', 'active'),
  ('22222225-2222-2222-2222-222222222224', '11111114-1111-1111-1111-111111111113', 'Chiamaka', 'Okafor', 'chiamaka@health.gov.ng', '+2348060000003', 'Regulatory Affairs Lead', 'email', 'active')
on conflict (id) do nothing;

insert into public.leads (id, product_id, organization_id, contact_id, assigned_to, source, lead_type, title, description, status, priority, source_url, referrer_url, submission_channel, metadata)
values
  ('33333334-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '11111112-1111-1111-1111-111111111111', '22222223-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'website', 'consultation_booking', 'Clinical development consultation request', 'Requested a consultation to discuss a phase III trial readiness program.', 'qualified', 'high', 'https://mednovalife.com/', 'https://www.google.com', 'homepage_booking', '{"service_interest": "clinical"}'),
  ('33333335-3333-3333-3333-333333333334', '11111111-1111-1111-1111-111111111111', '11111114-1111-1111-1111-111111111113', '22222225-2222-2222-2222-222222222224', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'website', 'regulatory_inquiry', 'Regulatory submission support request', 'Requested help with product registration and local filing strategy.', 'new', 'high', 'https://mednovalife.com/regulatory.html', 'https://mednovalife.com/', 'regulatory_page', '{"service_interest": "regulatory"}')
on conflict (id) do nothing;

insert into public.consultations (id, product_id, lead_id, organization_id, contact_id, assigned_consultant_id, title, consultation_type, scheduled_at, duration_minutes, status, meeting_link, notes)
values
  ('55555556-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', '33333334-3333-3333-3333-333333333333', '11111112-1111-1111-1111-111111111111', '22222223-2222-2222-2222-222222222222', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'Discovery session with BioNova', 'discovery', now() + interval '3 days', 60, 'scheduled', 'https://meet.google.com/demo', 'Discuss clinical development scope and timeline.')
on conflict (id) do nothing;

insert into public.opportunities (id, product_id, lead_id, consultation_id, organization_id, contact_id, owner_id, name, stage, amount, probability, expected_close_date, next_step, status)
values
  ('44444445-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', '33333334-3333-3333-3333-333333333333', '55555556-5555-5555-5555-555555555555', '11111112-1111-1111-1111-111111111111', '22222223-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Clinical development engagement', 'consultation', 350000.00, 70, current_date + 14, 'Book discovery session', 'active')
on conflict (id) do nothing;

insert into public.activities (id, product_id, organization_id, contact_id, lead_id, consultation_id, opportunity_id, actor_id, activity_type, subject, body, occurred_at, metadata)
values
  ('66666667-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', '11111112-1111-1111-1111-111111111111', '22222223-2222-2222-2222-222222222222', '33333334-3333-3333-3333-333333333333', '55555556-5555-5555-5555-555555555555', '44444445-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'email', 'Initial outreach sent', 'Sent the consultation follow-up email with service overview and next steps.', now() - interval '1 day', '{"channel": "email"}'),
  ('66666668-6666-6666-6666-666666666667', '11111111-1111-1111-1111-111111111111', '11111114-1111-1111-1111-111111111113', '22222225-2222-2222-2222-222222222224', '33333335-3333-3333-3333-333333333334', null, null, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'website_submission', 'Website regulatory inquiry', 'Submitted a regulatory inquiry through the website contact form.', now() - interval '2 hours', '{"source": "regulatory_page"}')
on conflict (id) do nothing;

insert into public.tasks (id, product_id, organization_id, lead_id, consultation_id, opportunity_id, assigned_to, title, description, priority, status, due_at, reminder_at)
values
  ('77777778-7777-7777-7777-777777777777', '11111111-1111-1111-1111-111111111111', '11111112-1111-1111-1111-111111111111', '33333334-3333-3333-3333-333333333333', '55555556-5555-5555-5555-555555555555', '44444445-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Prepare discovery brief', 'Prepare a discovery brief and agenda for the consultation call.', 'high', 'pending', now() + interval '1 day', now() + interval '12 hours')
on conflict (id) do nothing;

insert into public.email_messages (id, product_id, organization_id, contact_id, lead_id, consultation_id, opportunity_id, sender_id, direction, from_email, to_email, subject, body_text, status, provider, sent_at)
values
  ('99999990-9999-9999-9999-999999999999', '11111111-1111-1111-1111-111111111111', '11111112-1111-1111-1111-111111111111', '22222223-2222-2222-2222-222222222222', '33333334-3333-3333-3333-333333333333', '55555556-5555-5555-5555-555555555555', '44444445-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'outgoing', 'growth@mednovalife.com', 'grace@bionova.example', 'Thanks for your consultation request', 'Thank you for contacting MedNova. We will follow up shortly.', 'sent', 'resend', now() - interval '1 day')
on conflict (id) do nothing;

insert into public.files (id, product_id, organization_id, lead_id, consultation_id, opportunity_id, uploaded_by, file_name, storage_path, mime_type, file_size, file_kind, description)
values
  ('aaaaaaab-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', '11111112-1111-1111-1111-111111111111', '33333334-3333-3333-3333-333333333333', '55555556-5555-5555-5555-555555555555', '44444445-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'capability-statement.pdf', 'crm-files/capability-statement.pdf', 'application/pdf', 245760, 'capability_statement', 'Capability statement shared with the prospect.')
on conflict (id) do nothing;

insert into public.website_events (id, product_id, organization_id, contact_id, lead_id, session_identifier, event_name, page_url, referrer, metadata)
values
  ('bbbbbbbc-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', '11111112-1111-1111-1111-111111111111', '22222223-2222-2222-2222-222222222222', '33333334-3333-3333-3333-333333333333', 'session-001', 'consultation_booking_started', 'https://mednovalife.com/', 'https://www.google.com', '{"source": "organic"}'),
  ('bbbbbbbd-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', null, null, '33333335-3333-3333-3333-333333333334', 'session-002', 'compliance_checklist_downloaded', 'https://mednovalife.com/compliance-checklist.html', 'https://mednovalife.com/', '{"asset": "compliance_checklist"}')
on conflict (id) do nothing;
