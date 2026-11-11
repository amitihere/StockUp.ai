# StockPilot — Autonomous AI Procurement & Receipt Intelligence

> **Autonomous procurement pipeline for small retail: physical receipt intelligence, supplier comparison via Channel3, financial safeguard gates, and PayPal Sandbox payments.**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js%2014-black?style=flat&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma%20ORM-2D3748?style=flat&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![PayPal](https://img.shields.io/badge/PayPal-Sandbox%20Orders%20v2-00457C?style=flat&logo=paypal&logoColor=white)](https://developer.paypal.com/)
[![Tests](https://img.shields.io/badge/Vitest-38%2F38%20Passing-brightgreen?style=flat)](./tests)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## 1. Problem Statement

Small electronics and convenience retailers face a critical operational friction:
1. **Manual Inventory Tracking**: Stock depletion happens on paper receipts or separate cash registers, leading to unrecorded stockouts and lost revenue.
2. **Fragmented Sourcing**: When stock runs low, store owners spend hours comparing prices across disparate wholesalers, distributors, and online marketplaces.
3. **Risks of Uncontrolled AI**: Naive "autonomous agents" given spending authority present catastrophic risks of hallucinations, prompt injection, and unauthorized transactions.

---

## 2. Solution Overview

**StockPilot** is an autonomous procurement platform with enterprise safeguards:
- **Receipt Intelligence**: Store owners take a photo of physical sales receipts. Multimodal vision AI (Gemini / OpenAI) extracts line items, discounts, and totals.
- **Editable AG Grid & Stock Deduction**: Merchants review extracted lines in an interactive AG Grid, matching line items to inventory. Confirmation immediately deducts stock and detects newly created shortages.
- **Autonomous Supplier Sourcing**: Depleted items trigger the AI procurement agent. The agent queries **Channel3** for live supplier offers, verifies ratings, and calculates 14-day sales velocity buffers.
- **Human Approval & Policy Gate**: The agent formulates a proposal saved as `AWAITING_APPROVAL`. The agent **physically lacks payment authority**.
- **PayPal Sandbox Checkout**: Upon owner sign-off, the policy engine re-evaluates budgets at checkout. The owner pays through PayPal Sandbox (Orders API v2) with full idempotency, duplicate capture prevention, and immutable audit logs.

---

## 3. End-to-End System Architecture

```mermaid
flowchart TD
    subgraph ReceiptIntelligence ["1. Receipt Intelligence"]
        A["Physical Sales Receipt Photo"] -->|Vision OCR| B["AI Extraction (Gemini / OpenAI)"]
        B -->|Strict Zod Schema| C["Editable AG Grid Review"]
        C -->|Owner Confirms| D["Deduct Inventory Stock & Log Movements"]
    end

    subgraph AutonomousAgent ["2. Autonomous Sourcing"]
        D -->|Shortage Detected| E["Autonomous AI Procurement Agent"]
        E -->|Query Sourcing| F["Live Channel3 Catalog API"]
        E -->|Sales Velocity Formula| G["Dynamic 14-Day Restock Buffers"]
        F & G --> H["Purchase Proposal Formulated (AWAITING_APPROVAL)"]
    end

    subgraph SafeguardsAndPayment ["3. Safeguards & Payment"]
        H -->|Merchant Review| I["Approvals Queue (AG Grid)"]
        I -->|Owner Approves| J["APPROVED Status"]
        J -->|Re-Run Policy Engine| K["PayPal Sandbox Order Created"]
        K -->|Owner Authorizes| L["PayPal Capture & Verification"]
        L -->|Atomic prisma.$transaction| M["PAID Status & AuditLog Recorded"]
        M -->|Restock Receipt| N["Inventory Replenished"]
    end
```

---

## 4. Key Architectural Safeguards

For a detailed analysis of the safeguard design, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

1. **AI Isolation from Payments**: The AI agent has zero access to payment tools. Its terminal action is `request_approval`.
2. **Checkout Policy Re-Validation**: Policy rules (monthly spend caps, rating thresholds) are re-checked at the exact moment of payment creation to prevent budget overruns.
3. **Server-Derived Amounts**: All PayPal order amounts are calculated on the server from validated database rows—never from client request inputs.
4. **Idempotency Protection**: `PayPal-Request-Id` headers prevent duplicate charges on network retries.
5. **Untrusted OCR Sanitization**: Receipt text and supplier descriptions are treated as untrusted data to protect against prompt injection.

---

## 5. Environment Variables & Configuration

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

| Variable | Required | Description |
| :--- | :---: | :--- |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string (`postgresql://user:pass@host:5432/dbname`) |
| `CHANNEL3_API_KEY` | **Yes** | API key for live supplier search from [trychannel3.com](https://trychannel3.com) |
| `AI_PROVIDER` | **Yes** | AI provider to use: `"gemini"` (default) or `"openai"` |
| `GEMINI_API_KEY` | **Yes** | Google Gemini API key from [aistudio.google.com](https://aistudio.google.com/) |
| `GEMINI_MODEL` | No | Model name (default: `"gemini-2.5-flash"`) |
| `OPENAI_API_KEY` | Optional | Required if `AI_PROVIDER="openai"` |
| `PAYPAL_CLIENT_ID` | **Yes** | PayPal Sandbox Client ID from [developer.paypal.com](https://developer.paypal.com/) |
| `PAYPAL_CLIENT_SECRET` | **Yes** | PayPal Sandbox Client Secret (server-side only) |
| `PAYPAL_ENV` | **Yes** | Always set to `"sandbox"` |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID`| **Yes** | Exposed to client for `@paypal/react-paypal-js` button rendering |

> [!IMPORTANT]
> **Zero Secrets in Git**: All sensitive credentials (`PAYPAL_CLIENT_SECRET`, `GEMINI_API_KEY`, etc.) remain server-side. Committed files use only placeholders.

---

## 6. Quick Start & Local Development

### Prerequisites
- Node.js `18.18+` or `20+`
- Local PostgreSQL instance or Docker

### Installation & Database Setup
```bash
# 1. Install dependencies
npm ci

# 2. Sync database schema
npx prisma db push

# 3. Seed demo catalog & historical sales velocity
npm run demo:reset

# 4. Start development server
npm run dev
```

Visit `http://localhost:3000` to access the dashboard.

---

## 7. Demo Assets & Reset Commands

StockPilot includes pre-rendered, high-fidelity sample receipts in `/public/demo-receipts`:
1. `receipt-bulk-discount.png`: Wholesale bulk sale with customer discount pushing 2 items below minimum stock.
2. `receipt-store-sale.png`: Everyday walk-in charging accessories sale.
3. `receipt-peripherals.png`: Office computer peripherals sale.

To reset the database between demo takes:
```bash
npm run demo:reset
```
This resets the catalog products, restores baseline policy settings, clears all orders and receipts, and populates 30-day `StockMovement` records for sales velocity calculations.

---

## 8. Testing Suite

Run the automated test suite powered by Vitest:

```bash
# Run all unit tests (Policy, State Machine, PayPal client, Receipts OCR matching)
npm test

# Run all tests in watch mode
npm run test:all
```

**Test Coverage Highlights**:
- `tests/policy.test.ts`: Policy rules, budget enforcement, 14-day velocity restock formula.
- `tests/stateMachine.test.ts`: Strict state transitions, invalid transition rejections, cancellation handling.
- `tests/paypal.test.ts`: OAuth token caching, 401 retry, 429 backoff, integer cent math.
- `tests/receipts.test.ts`: Strict Zod receipt parsing, discrepancy detection, token-similarity product matching.

---

## 9. Deployment (Render)

StockPilot is production-ready for deployment on Render using the included `render.yaml` blueprint. See [DEPLOY.md](./DEPLOY.md) for step-by-step instructions.

- **Health Check Endpoint**: `GET /api/health` probes PostgreSQL with `SELECT 1` and returns `{ status: "ok", database: "connected" }`.

---

## 10. AI Models & Tools Used

- **Google Gemini**:
  - `gemini-2.5-flash` for high-throughput autonomous procurement loops.
  - Multimodal Vision API (`@google/genai`) for physical receipt OCR and structured JSON extraction.
- **OpenAI Adapter** (`gpt-4o`): Fallback provider for receipt vision extraction and function calling.
- **Channel3 API**: Live sourcing across real retail catalogs with price and rating normalization.
- **AG Grid Community**: High-performance editable data grids for receipt verification and order inspection.
- **PayPal SDK**: Orders API v2 integration with `@paypal/react-paypal-js`.

---

## 11. Honest Scope & Transparency

To provide full clarity on implementation boundaries:

| Capability | Real Implementation | Demo Scoped |
| :--- | :--- | :--- |
| **Channel3 Sourcing** | Real, live API calls to Channel3 search and product endpoints. | N/A |
| **Receipt Intelligence** | Real vision OCR via Gemini/OpenAI; real Zod schema validation; real stock deduction. | Photos uploaded by user or selected from `/public/demo-receipts`. |
| **Financial Safeguards** | Real state machine; real DB transactions; real policy re-validation; real audit logs. | N/A |
| **PayPal Payments** | Real Orders API v2 `createOrder`, `getOrder`, `captureOrder`, idempotency headers. | Operates in **Sandbox** mode with sandbox test accounts (judging standard). |
| **User Identity** | Single demo store owner (`demo@stockpilot.ai`) to simplify judging. | Multi-tenant auth out of scope. |

---

## 12. License

This project is licensed under the MIT License — see the [LICENSE](./LICENSE) file for details.
