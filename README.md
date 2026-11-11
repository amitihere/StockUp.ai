# StockPilot — Autonomous AI Procurement for Small Retailers

> **PART 1 & 2 OF 4: Foundation Architecture, Channel3 Discovery & Autonomous AI Procurement Agent**

StockPilot is an enterprise-grade autonomous procurement platform designed for small electronics and convenience retailers. It bridges the gap between physical sales shortages and automated restocking: from low-stock detection to supplier comparison via Channel3, approval policy enforcement, and PayPal sandbox payments.

- **Part 1 (Done)**: Next.js App Router, Tailwind CSS, dark navy enterprise B2B dashboard theme, PostgreSQL + Prisma schema, Zod boundary validations, shared low-stock business logic, AG Grid Community table, and the demo seed dataset.
- **Part 2 (Current)**: Autonomous AI procurement agent (Gemini/OpenAI abstraction), Channel3 live product search and canonical offer comparison, pure deterministic policy engine, restock calculation algorithms, live execution timeline polling, and proposal review with `AWAITING_APPROVAL` status.

---

## Tech Stack & Architecture

- **Framework**: Next.js 14+ (App Router, Server Components & Route Handlers)
- **Language**: TypeScript (Strict mode, zero `any`)
- **Database ORM**: PostgreSQL with Prisma ORM
- **AI Models**: Google Gemini (`gemini-3.8-flash` via `@google/genai`) with OpenAI fallback (`gpt-4o`)
- **Product & Supplier Data**: Real-time supplier offers & catalog via Channel3 API (`POST /v1/search`, `GET /v1/products/:id`)
- **Component Styling**: Tailwind CSS, Radix UI primitives, Lucide Icons
- **Data Grid**: AG Grid Community (`v32.3+`) with responsive sorting, column filtering, and quick search
- **Unit Testing**: Vitest (`14/14 tests passing`)
- **Validation**: Zod (100% server boundary enforcement)
- **Monetary Storage**: Strict integer minor units (cents) with currency tracking (`USD`)

---

## Directory Structure

```text
StockUp.ai/
├── docker-compose.yml             # Local PostgreSQL container service
├── prisma/
│   ├── schema.prisma              # Complete database schema for Parts 1–4
│   └── seed.ts                    # Demo user, policy & 12 realistic electronics products
├── src/
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx         # Dashboard shell (Sidebar + TopBar)
│   │   │   └── dashboard/
│   │   │       ├── page.tsx       # Executive Overview dashboard
│   │   │       ├── inventory/     # AG Grid inventory catalog
│   │   │       ├── settings/      # Procurement policy controls
│   │   │       ├── ai-procurement/# Placeholder (Part 2)
│   │   │       ├── product-discovery/ # Placeholder (Part 3)
│   │   │       ├── approvals/     # Placeholder (Part 2)
│   │   │       ├── transactions/  # Placeholder (Part 4)
│   │   │       └── receipts/      # Placeholder (Part 4)
│   │   ├── api/
│   │   │   ├── inventory/         # GET (list), POST (create)
│   │   │   │   └── [id]/          # GET, PATCH (update), DELETE
│   │   │   └── policy/            # GET, PUT (upsert policy)
│   │   ├── globals.css            # Dark theme CSS variables & AG Grid navy overrides
│   │   ├── layout.tsx             # Root layout with Inter typography
│   │   └── page.tsx               # Redirect to /dashboard
│   ├── components/
│   │   ├── dashboard/             # StatCard, LowStockList, RecentActivity, OverviewPage
│   │   ├── inventory/             # InventoryPage, ProductDialog, DeleteDialog, StockStatusBadge
│   │   ├── layout/                # Sidebar, TopBar, PlaceholderPage
│   │   ├── settings/              # SettingsPage
│   │   └── ui/                    # Button, Input, Dialog, Card, Badge, Label, Separator
│   ├── lib/
│   │   ├── prisma.ts              # Singleton Prisma client
│   │   ├── utils.ts               # Shared low-stock logic (stock < minStock), currency conversion
│   │   └── validations.ts         # Zod schemas for Product & Policy
│   ├── services/
│   │   └── inventory.ts           # Demo user, product CRUD, overview analytics, policy service
│   └── types/
│       └── index.ts               # Domain types, API responses, status definitions
├── .env.example                   # DATABASE_URL specification
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

---

## Local Setup & Quick Start

### 1. Prerequisites
- **Node.js**: v18.18+ or v20+
- **Docker**: Optional, for running local PostgreSQL

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Configure your environment keys:
```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/stockpilot?schema=public"

# Channel3 (Live Product Search & Supplier Comparison)
CHANNEL3_API_KEY="c3_live_..."

# AI Engine
AI_PROVIDER="gemini" # or "openai"
GEMINI_API_KEY="AIzaSy..."
OPENAI_API_KEY="sk-..." # optional if AI_PROVIDER="openai"
```

### 3. Run Unit Tests (Vitest)
Verify the pure deterministic policy engine and restock calculations:
```bash
npm test
# Or with coverage/watch:
npx vitest run
```

### 4. Start PostgreSQL (via Docker Compose)
If you don't have a local PostgreSQL instance running:
```bash
docker-compose up -d
```
*To stop the database later: `docker-compose down`*

### 4. Install Dependencies
```bash
npm install
```

### 5. Run Database Migrations & Seed Data
Generate the Prisma client, apply database schema, and seed the demo catalog:
```bash
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
```

### 6. Start the Development Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser. The app will automatically redirect to `/dashboard`.

---

## API Endpoints Reference

| Method | Endpoint | Description | Validation |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/inventory` | List all inventory products | None |
| `POST` | `/api/inventory` | Create a new product SKU | Zod `productCreateSchema` (converts dollars to cents) |
| `GET` | `/api/inventory/:id` | Retrieve single product details | ID lookup |
| `PATCH`| `/api/inventory/:id` | Update product SKU, stock, or price | Zod `productUpdateSchema` |
| `DELETE`| `/api/inventory/:id`| Remove product from catalog | ID lookup |
| `GET` | `/api/policy` | Retrieve store procurement policy | Demo user lookup |
| `PUT` | `/api/policy` | Upsert procurement rules & budgets | Zod `policyUpdateSchema` (converts dollars to cents) |
| `POST` | `/api/products/search` | Search real supplier products via Channel3 | Zod `{ query: string, limit?: number }` |
| `GET` | `/api/products/:id` | Retrieve canonical product offers & details | ID lookup |
| `POST` | `/api/agent/run` | Launch autonomous procurement agent run | Zod `{ prompt: string }` |
| `GET` | `/api/agent/runs/:id` | Get procurement run status, proposal & logs | Run ID lookup |
| `GET` | `/api/agent/runs/:id/activities` | Poll live tool call activities for execution timeline | Run ID lookup |
| `GET` | `/api/dashboard/overview` | Executive stats, low-stock alerts & recent agent activities | None |

---

## Database Models Overview

- **`User`**: Demo user (`demo@stockpilot.ai`) owning catalog and policies.
- **`Product`**: SKU, name, category, `currentStock`, `minStock`, `unitCost` (cents), relations.
- **`ProcurementPolicy`**: `monthlyBudget` ($2,000), `maxAutomaticPurchase` ($100), `requireApprovalAbove` ($100), `minimumProductRating` (4.0), `allowAutomaticPurchases` (false).
- **`ProcurementRun`**: Pre-created for Part 2 AI replenishment loops.
- **`SupplierProduct`**: Pre-created for Part 3 Channel3 supplier comparisons.
- **`PurchaseOrder` & `PurchaseOrderItem`**: Full order lifecycle with enum status (`DRAFT`, `AWAITING_APPROVAL`, `APPROVED`, `PAYMENT_PENDING`, `PAID`, `FAILED`, `CANCELLED`).
- **`Approval`**: Approvals audit log for orders exceeding the $100 ceiling.
- **`Payment`**: Pre-created for Part 4 PayPal sandbox orders and capture records.
- **`AgentActivity`**: Structured audit trail for tool calls and AI decision traces.
- **`Receipt` & `ReceiptLineItem` & `StockMovement`**: Pre-created for Part 4 Receipt Intelligence vision deductions.

