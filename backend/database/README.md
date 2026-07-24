# MedNova CRM database architecture

This is the final MVP database design for the MedNova CRM. It is intentionally simple, multi-product ready, and aligned to the workflow:

Website visitor -> Lead -> Consultation -> Opportunity -> Activities -> Tasks -> Emails -> Files

## What changed in this revision

- Kept the multi-product architecture centered on products.
- Kept the organizations and contacts model.
- Reworked the workflow to Lead -> Consultation -> Opportunity.
- Removed the earlier enterprise-only tables and permission complexity.
- Added website_events as the foundation for future intelligence.
- Kept activities, email_messages, and files as the operational history layer.

## Core tables

- products
- roles
- users
- product_memberships
- organizations
- contacts
- leads
- consultations
- opportunities
- activities
- tasks
- email_messages
- files
- website_events

## Why each table exists

- products: root entity for every product line and future expansion.
- roles: basic role lookup for Admin, Sales, Consultant, and Viewer.
- users: CRM users and profile records.
- product_memberships: links users to the products they can access.
- organizations: account/company-level records.
- contacts: people linked to organizations.
- leads: inbound interest captured from the website or other channels.
- consultations: discovery or service sessions that qualify interest.
- opportunities: commercial interest that may result from a consultation.
- activities: timeline/audit trail for everything that happens.
- tasks: operational follow-up work.
- email_messages: audit trail for outbound and inbound email.
- files: document storage and attachment history.
- website_events: anonymous and known website interactions for future analytics.

## Relationship summary

- One organization owns many contacts.
- One lead belongs to one product and may belong to one organization and one contact.
- One consultation belongs to one lead.
- One opportunity belongs to one consultation and one lead.
- Activities, tasks, email messages, and files can all attach to leads, consultations, and opportunities.

## Files

- 001_init_schema.sql: schema definition.
- 002_seed_data.sql: seed data for the MVP.
- complete_migration.sql: full schema and seed data in one file.
