# Multi-Tenant SaaS Invoice & Billing System

A production-grade multi-tenant invoice and billing API built with NestJS, PostgreSQL, and TypeScript. Features database-level tenant isolation via Row-Level Security (RLS), JWT authentication with refresh token rotation, background PDF generation via BullMQ, and S3-compatible file storage.

## Architecture

```
┌─────────────────────────────────────────────┐
│           NestJS API (TypeScript)            │
│         JWT Auth + Validation + RBAC         │
└──────────┬──────────────────┬───────────────┘
           │                  │
    ┌──────▼──────┐    ┌──────▼──────┐
    │ PostgreSQL   │    │    Redis    │
    │  (RLS)       │    │  (BullMQ)  │
    └─────────────┘    └──────┬──────┘
                              │
                    ┌─────────▼─────────┐
                    │   BullMQ Worker    │
                    │  PDF Generation    │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   MinIO (S3)       │
                    │  Invoice PDFs      │
                    └───────────────────┘
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | TypeScript + NestJS | Type-safe, modular backend framework |
| Database | PostgreSQL 16 | Relational DB with Row-Level Security |
| ORM | Prisma 6 | Type-safe queries + migrations |
| Cache/Queue | Redis + BullMQ | Background job processing |
| Storage | MinIO (S3-compatible) | Invoice PDF storage |
| Auth | JWT + Passport | Access/refresh token rotation |
| Docs | Swagger/OpenAPI | Auto-generated API documentation |
| Containers | Docker Compose | One-command dev environment |

## Key Technical Decisions

### Why PostgreSQL RLS over application-level filtering?
Application-level filtering (adding `WHERE tenant_id = ?` to every query) relies on developers never making mistakes. A single missed filter leaks data across tenants. RLS enforces isolation at the database level — even if application code has a bug, Postgres blocks cross-tenant access. This is defense-in-depth for multi-tenant SaaS.

### Why advisory locks for invoice numbering?
Sequential invoice numbers (INV-00001, INV-00002) must never have gaps or duplicates. If two users create invoices simultaneously, both could read the last number as INV-00003 and try to create INV-00004. `pg_advisory_xact_lock` ensures only one transaction per tenant can generate a number at a time, and the lock automatically releases when the transaction ends.

### Why BullMQ for PDF generation?
PDF generation takes 1-3 seconds. Running it synchronously in the API request would block the response and cause timeouts under load. BullMQ processes PDF jobs in the background — the API responds instantly with "invoice sent", and the worker generates + uploads the PDF asynchronously. Failed jobs are automatically retried.

### Why refresh token rotation with family-based theft detection?
Short-lived access tokens (15 min) limit the damage window if stolen. Refresh tokens (7 days) allow session persistence without re-login. Token rotation means each refresh token is single-use — after rotation, the old token is revoked. If a stolen token is reused, the server detects it and revokes the entire token family, forcing re-authentication.

### Why Decimal instead of floating point for money?
JavaScript floats are imprecise: `0.1 + 0.2 = 0.30000000000000004`. For an invoice system processing thousands of line items, these errors compound into real financial discrepancies. Postgres `DECIMAL(12,2)` provides exact arithmetic, and all calculations are rounded to 2 decimal places at every step.

## Getting Started

### Prerequisites
- Node.js 18+
- Docker Desktop

### Setup

```bash
# Clone the repo
git clone https://github.com/Faehehe/saas-invoice-system.git
cd saas-invoice-system

# Install dependencies
npm install

# Start Postgres, Redis, MinIO
docker-compose up -d

# Run database migrations
npx prisma migrate dev

# Set up Row-Level Security
# PowerShell:
Get-Content prisma/rls/setup.sql | docker exec -i saas-invoice-system-postgres-1 psql -U invoice_user -d invoice_db
# Linux/Mac:
cat prisma/rls/setup.sql | docker exec -i saas-invoice-system-postgres-1 psql -U invoice_user -d invoice_db

# Start the server
npm run start:dev
```

The API runs at `http://localhost:3000/api`
Swagger docs at `http://localhost:3000/api/docs`
MinIO console at `http://localhost:9001` (minioadmin/minioadmin)

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register new tenant + owner |
| POST | /api/auth/login | Login, returns JWT tokens |
| POST | /api/auth/refresh | Rotate refresh token |
| POST | /api/auth/logout | Revoke token family |

### Customers
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/customers | Create customer |
| GET | /api/customers | List with pagination |
| GET | /api/customers/:id | Get with invoice summary |
| PATCH | /api/customers/:id | Update |
| DELETE | /api/customers/:id | Delete |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/products | Create product |
| GET | /api/products | List with pagination |
| GET | /api/products/:id | Get details |
| PATCH | /api/products/:id | Update |
| DELETE | /api/products/:id | Soft delete |

### Invoices
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/invoices | Create draft with line items |
| GET | /api/invoices | List with filters |
| GET | /api/invoices/:id | Full details |
| PATCH | /api/invoices/:id | Update draft |
| POST | /api/invoices/:id/send | Send + trigger PDF generation |
| POST | /api/invoices/:id/cancel | Cancel invoice |
| GET | /api/invoices/:id/pdf | Get presigned PDF download URL |

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/invoices/:id/payments | Record payment |
| GET | /api/invoices/:id/payments | List payments |
| DELETE | /api/payments/:id | Void payment |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/reports/dashboard | Revenue, outstanding, overdue summary |

## Project Structure

```
src/
├── auth/           # JWT auth + refresh token rotation
├── common/         # Decorators, guards, pipes
├── customers/      # Customer CRUD
├── database/       # Prisma service
├── invoices/       # Invoice creation + status management
├── payments/       # Payment recording + invoice updates
├── pdf/            # PDF generation worker (BullMQ)
├── products/       # Product CRUD
├── queue/          # BullMQ configuration
├── reports/        # Dashboard aggregation queries
└── storage/        # MinIO file storage
```

## Environment Variables

Copy `.env.example` to `.env`:

```env
DATABASE_URL="postgresql://invoice_user:invoice_pass@localhost:5433/invoice_db?schema=public"
JWT_SECRET="your-secret-key"
JWT_EXPIRATION="15m"
JWT_REFRESH_EXPIRATION="7d"
REDIS_HOST="localhost"
REDIS_PORT=6379
MINIO_ENDPOINT="localhost"
MINIO_PORT=9000
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
MINIO_BUCKET="invoices"
```

## What I'd Build Next

- **Email notifications** — Send invoice PDFs via email using Nodemailer + BullMQ
- **Stripe integration** — Online payment collection with webhooks
- **Audit logging** — Track all changes with user/timestamp
- **Aging reports** — Accounts receivable aging (0-30, 31-60, 61-90, 90+ days)
- **Multi-currency** — Support for USD, EUR, GBP with exchange rates
- **Rate limiting** — Per-tenant API throttling
- **Integration tests** — Jest + Supertest for core flows
