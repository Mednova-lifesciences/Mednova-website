# Final database architecture document

## Business flow

`mermaid
flowchart TD
    A[Website Visitor] --> B[Lead]
    B --> C[Consultation]
    C --> D[Opportunity]
    D --> E[Activities]
    D --> F[Tasks]
    D --> G[Email Messages]
    D --> H[Files]
`

## ER overview

`mermaid
erDiagram
    PRODUCTS ||--o{ LEADS : owns
    PRODUCTS ||--o{ CONSULTATIONS : owns
    PRODUCTS ||--o{ OPPORTUNITIES : owns
    PRODUCTS ||--o{ ACTIVITIES : owns
    PRODUCTS ||--o{ TASKS : owns
    PRODUCTS ||--o{ EMAIL_MESSAGES : owns
    PRODUCTS ||--o{ FILES : owns
    PRODUCTS ||--o{ WEBSITE_EVENTS : owns

    ORGANIZATIONS ||--o{ CONTACTS : contains
    ORGANIZATIONS ||--o{ LEADS : related_to
    ORGANIZATIONS ||--o{ CONSULTATIONS : related_to
    ORGANIZATIONS ||--o{ OPPORTUNITIES : related_to

    CONTACTS ||--o{ LEADS : related_to
    CONTACTS ||--o{ CONSULTATIONS : related_to
    CONTACTS ||--o{ OPPORTUNITIES : related_to

    LEADS ||--o{ CONSULTATIONS : creates
    LEADS ||--o{ ACTIVITIES : logs
    LEADS ||--o{ TASKS : has
    LEADS ||--o{ EMAIL_MESSAGES : receives
    LEADS ||--o{ FILES : attaches_to
    LEADS ||--o{ WEBSITE_EVENTS : observed

    CONSULTATIONS ||--o{ OPPORTUNITIES : converts_to
    CONSULTATIONS ||--o{ ACTIVITIES : logs
    CONSULTATIONS ||--o{ TASKS : has
    CONSULTATIONS ||--o{ EMAIL_MESSAGES : receives
    CONSULTATIONS ||--o{ FILES : attaches_to

    OPPORTUNITIES ||--o{ ACTIVITIES : logs
    OPPORTUNITIES ||--o{ TASKS : has
    OPPORTUNITIES ||--o{ EMAIL_MESSAGES : receives
    OPPORTUNITIES ||--o{ FILES : attaches_to

    USERS ||--o{ PRODUCT_MEMBERSHIPS : belongs_to
    PRODUCTS ||--o{ PRODUCT_MEMBERSHIPS : includes
    ROLES ||--o{ USERS : assigned_to
`

## Notes

- This schema is designed for MedNova's current website and future product lines.
- It avoids over-engineering while keeping the CRM practical for sales, consulting, and follow-up workflows.
- Website events are included to support future analytics and intelligent automation.
