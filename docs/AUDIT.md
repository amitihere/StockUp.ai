# StockPilot — Codebase & Hackathon Readiness Audit

**Audit Date:** 2026-11-12  
**Repository:** `/Users/amitianeesh/Desktop/StockUp.ai` (branch `main`, HEAD `65c1599`, with uncommitted changes in working tree)  
**Evidence Legend:**
- `[RAN]` = Verified by actually executing the command or test in this audit session.
- `[CODE]` = Verified by reading the source code directly.
- `[ASSUMED]` = Not verified at runtime (e.g., requires live PostgreSQL, PayPal Sandbox browser login, or external API keys).

---

## Executive Summary of Tool Runs (`[RAN]`)

| Command | Outcome | Observed Output / Notes |
| :--- | :--- | :--- |
| `npm test` | **PASS** (38/38) | `vitest run tests/policy.test.ts tests/stateMachine.test.ts tests/paypal.test.ts tests/receipts.test.ts` — 4 test files, 38 tests passed in 204ms. |
| `npm run test:all` | **FAIL** (1 failed, 5 skipped, 38 passed) | `tests/agent.e2e.test.ts` failed and `tests/e2e.flow.test.ts` skipped all 5 tests because PostgreSQL is not running at `localhost:5432` (`Can't reach database server at localhost:5432`). |
| `npm run build` | **PASS** (exit 0) | `prisma generate && next build` succeeded; TypeScript type-checking passed; 12 static/dynamic pages and 23 API routes built. ESLint was skipped (`Skipping linting` in `next.config.js` `eslint.ignoreDuringBuilds: true`). |
| `npm run lint` | **BLOCKED / INTERACTIVE** | `next lint` prompted interactively (`? How would you like to configure ESLint?`) because no `.eslintrc.*` config file exists in the repo. |
| `git status` | **CLEAN / UNTRACKED AUDIT** | Audited against commit HEAD. |

---

## 1. What the App Does Today

StockPilot is a single-tenant (demo user `demo@stockpilot.ai`) Next.js web application for small electronics retailers. It lets a store owner track inventory, upload photos of physical sales receipts to deduct stock via Vision AI, run an autonomous AI procurement agent that searches real supplier listings via Channel3, review and approve purchase proposals, pay via PayPal Sandbox, and mark paid orders as received to restock inventory.

### 1.1 Pages and User Capabilities (`[CODE]`)

| Route | File | What a User Can Do |
| :--- | :--- | :--- |
| `/` | `src/app/page.tsx` | Immediately redirects to `/dashboard`. |
| `/dashboard` | `src/app/(dashboard)/dashboard/page.tsx`, `src/components/dashboard/OverviewPage.tsx` | View KPI cards (Inventory Value, Low Stock Count, Pending Approvals, Monthly Spend), Low Stock alert list, Top Sellers (30-day sales velocity & 14-day cover), and Recent Activity feed. |
| `/dashboard/inventory` | `src/app/(dashboard)/dashboard/inventory/page.tsx`, `src/components/inventory/InventoryPage.tsx` | Browse, search, filter, add, edit, and delete store products in an AG Grid table (`AgGridReact`). |
| `/dashboard/receipts` | `src/app/(dashboard)/dashboard/receipts/page.tsx` | Upload a receipt image (JPEG/PNG/WebP up to 5 MB), view Vision AI extracted line items in an editable AG Grid, see bulk discount insights, manually add/edit/delete lines, match lines to inventory SKUs, confirm the receipt to deduct stock, and click **"Launch Restock Agent"** when shortages are detected. |
| `/dashboard/ai-procurement` | `src/app/(dashboard)/dashboard/ai-procurement/page.tsx` | Enter a procurement prompt (or receive pre-filled prompt + `receiptId` from Receipts) and optional budget cap, launch the autonomous AI agent, and watch live-polled tool calls, reasoning, and generated `AWAITING_APPROVAL` purchase orders. |
| `/dashboard/product-discovery` | `src/app/(dashboard)/dashboard/product-discovery/page.tsx` | Search live Channel3 catalog products by keyword, inspect offers/ratings/retailers, and select 2–4 products for a side-by-side comparison modal. |
| `/dashboard/approvals` | `src/app/(dashboard)/dashboard/approvals/page.tsx` | Inspect all purchase orders in an AG Grid queue, filter by status, approve or reject `AWAITING_APPROVAL` orders, pay `APPROVED`/`PAYMENT_PENDING` orders via PayPal Sandbox buttons, cancel orders, and click **"Mark as Received"** on `PAID` orders to increment inventory. |
| `/dashboard/transactions` | `src/app/(dashboard)/dashboard/transactions/page.tsx` | View all `Payment` records in an AG Grid ledger, filter by status, and inspect `paypalOrderId`, `captureId`, `idempotencyKey`, and linked order items. |
| `/dashboard/settings` | `src/app/(dashboard)/dashboard/settings/page.tsx`, `src/components/settings/SettingsPage.tsx` | View and update `ProcurementPolicy` settings (Monthly Budget, Max Automatic Purchase, Require Approval Above, Minimum Product Rating, Allow Automatic Purchases toggle). |

### 1.2 End-to-End User Journey as Implemented (`[CODE]`)

1. **Receipt Upload & OCR:** User uploads a receipt image on `/dashboard/receipts` → `POST /api/receipts/upload` hashes the file (SHA-256), rejects if an identical `CONFIRMED` receipt exists, saves binary `imageData` to PostgreSQL, calls `extractReceiptFromImage()` (Gemini/OpenAI Vision), validates JSON with Zod (`receiptExtractionSchema`), and fuzzy-matches lines to `Product` rows (`matchReceiptLineToProduct`).
2. **Review & Stock Deduction:** User edits/matches lines in AG Grid and clicks **Confirm Receipt & Deduct Stock** → `POST /api/receipts/[id]/confirm` runs a Prisma transaction that replaces `ReceiptLineItem`s, decrements `Product.currentStock` (clamped at `0`), creates negative `StockMovement` rows (`source: 'receipt'`), marks the receipt `CONFIRMED`, logs `CONFIRM_RECEIPT` in `AuditLog`, and returns `lowStockProducts`.
3. **Agent Launch (Manual Click):** If shortages exist, `/dashboard/receipts` shows a **"Launch Restock Agent"** link to `/dashboard/ai-procurement?prompt=...&receiptId=...`. The user clicks **Run Autonomous Agent** → `POST /api/agent/run` creates a `ProcurementRun` (`RUNNING`) and fires `runProcurementAgent()` asynchronously in the background.
4. **Autonomous Sourcing Loop:** The agent (`src/services/agent/runner.ts`) loops up to 12 iterations using `MODEL_TOOLS`:
   - `get_low_stock_products` / `get_sales_velocity` / `get_inventory`
   - `search_products` (live `POST https://api.trychannel3.com/v1/search`, caching results in `SupplierProduct`)
   - `create_purchase_proposal` (recalculates totals, trims to budget via `trimProposalToBudget`, runs `validatePurchasePolicy`)
   - `request_approval` (creates `PurchaseOrder` in `AWAITING_APPROVAL` and `Approval` in `PENDING`, marks `ProcurementRun` `COMPLETED`).
5. **Human Approval:** User navigates to `/dashboard/approvals`, selects the order, and clicks **Approve & Enable Payment** → `POST /api/procurement/orders/[id]/approve` transitions `AWAITING_APPROVAL → APPROVED` via `transitionPurchaseOrderState()` and logs `APPROVE` in `AuditLog`.
6. **PayPal Sandbox Checkout:**
   - Clicking the PayPal button triggers `createOrder` → `POST /api/payments/create-order`, which re-runs `validatePurchasePolicy`, calls `createPayPalOrder()` (`POST /v2/checkout/orders`), stores a `Payment` row (`CREATED`), and transitions `APPROVED → PAYMENT_PENDING`.
   - User logs into PayPal Sandbox popup and approves.
   - `onApprove` triggers `POST /api/payments/capture-order`, which fetches the order (`getPayPalOrder`), verifies `custom_id`/`reference_id`, `amount.value`, and `currency_code`, calls `capturePayPalOrder()` (`POST /v2/checkout/orders/{id}/capture`), updates `Payment` to `COMPLETED`, transitions `PAYMENT_PENDING → PAID`, and logs `CAPTURE_PAYPAL_ORDER` + `VERIFY_PAYMENT` in `AuditLog`.
7. **Restock on Receipt:** User clicks **Mark as Received** on `/dashboard/approvals` → `POST /api/procurement/orders/[id]/receive` increments `Product.currentStock`, creates positive `StockMovement` rows (`source: 'order'`), and logs `MARK_RECEIVED` in `AuditLog`.

### 1.3 Architecture Map (`[CODE]`)

- **Frontend (`src/app/(dashboard)/`, `src/components/`):** Next.js 14 App Router client/server pages styled with Tailwind + Radix UI + AG Grid Community (`ag-grid-react`) + `@paypal/react-paypal-js`.
- **API Layer (`src/app/api/`):** 23 Next.js Route Handlers covering `health`, `dashboard/overview`, `inventory`, `policy`, `products/search`, `products/[id]`, `receipts/*`, `agent/*`, `procurement/orders/*`, and `payments/*`.
- **Services (`src/services/`):**
  - `ai/` (`factory.ts`, `gemini.ts`, `openai.ts`, `types.ts`): Dual LLM provider adapter (`@google/genai` and `openai`).
  - `agent/` (`runner.ts`, `tools.ts`): Autonomous tool-calling loop and 11 defined tools (7 exposed in `MODEL_TOOLS`).
  - `channel3/` (`index.ts`, `types.ts`): Live HTTP client for `https://api.trychannel3.com/v1`.
  - `paypal/` (`index.ts`, `types.ts`): PayPal Orders v2 REST client with OAuth token caching, 401/429/5xx retries, and integer-cent helpers.
  - `policy/` (`index.ts`): Deterministic `validatePurchasePolicy`, `calculateRestockQuantity`, `trimProposalToBudget`.
  - `procurement/` (`stateMachine.ts`): `VALID_TRANSITIONS` matrix and atomic `transitionPurchaseOrderState`.
  - `receipts/` (`schema.ts`, `extraction.ts`, `matching.ts`): Vision OCR prompt, Zod validation, and Jaccard/SKU matching.
  - `inventory.ts`: `getDemoUser()`, `getOverviewStats()`, `getPolicy()`, CRUD helpers.
- **Database (`prisma/schema.prisma`):** PostgreSQL via Prisma ORM with 13 models: `User`, `Product`, `ProcurementPolicy`, `ProcurementRun`, `SupplierProduct`, `PurchaseOrder`, `PurchaseOrderItem`, `Approval`, `Payment`, `AuditLog`, `AgentActivity`, `Receipt`, `ReceiptLineItem`, `StockMovement`, plus `PurchaseOrderStatus` enum.

### 1.4 Data-Flow Diagram (`[CODE]`)

```mermaid
flowchart TD
    A["Receipt Photo Upload (/dashboard/receipts)"] -->|POST /api/receipts/upload| B["SHA-256 Dedupe + Gemini/OpenAI Vision OCR"]
    B -->|Zod + SKU/Token Match| C["Editable AG Grid Review"]
    C -->|POST /api/receipts/[id]/confirm| D["Prisma Tx: Deduct Product.currentStock + StockMovement (-)"]
    D -->|Shortages Returned| E["Owner Clicks 'Launch Restock Agent'"]
    E -->|POST /api/agent/run| F["Agent Loop (runner.ts, max 12 iters)"]
    F -->|search_products| G["Channel3 Live API (/v1/search)"]
    F -->|create_purchase_proposal| H["Policy Engine (validatePurchasePolicy)"]
    F -->|request_approval| I["PurchaseOrder (AWAITING_APPROVAL)"]
    I -->|POST /api/procurement/orders/[id]/approve| J["PurchaseOrder (APPROVED)"]
    J -->|POST /api/payments/create-order| K["Re-run Policy + PayPal v2/checkout/orders (PAYMENT_PENDING)"]
    K -->|Buyer Sandbox Popup| L["PayPal Buyer Approval"]
    L -->|POST /api/payments/capture-order| M["Verify custom_id/amount/currency + Capture + PAID + AuditLog"]
    M -->|POST /api/procurement/orders/[id]/receive| N["Increment Product.currentStock + StockMovement (+)"]
```

---

## 2. Where PayPal Is Used

### 2.1 Files, Routes, and UI Elements (`[CODE]`)

| Component | Path | Role |
| :--- | :--- | :--- |
| PayPal REST Client | `src/services/paypal/index.ts` | `getAccessToken()` (OAuth2 client credentials with in-memory cache), `paypalRequest()` (401 refresh, 429/5xx retry, `PayPal-Request-Id` header), `createPayPalOrder()`, `getPayPalOrder()`, `capturePayPalOrder()` (handles `ORDER_ALREADY_CAPTURED`), `centsToString()`, `stringToCents()`. |
| PayPal Types | `src/services/paypal/types.ts` | TypeScript interfaces for OAuth, Orders v2, and Capture responses. |
| Create Order API | `src/app/api/payments/create-order/route.ts` | Validates `APPROVED` (or reuses `PAYMENT_PENDING` `CREATED` payment), re-runs `validatePurchasePolicy()`, calls `createPayPalOrder()`, creates `Payment` (`CREATED`), transitions order to `PAYMENT_PENDING`. |
| Capture Order API | `src/app/api/payments/capture-order/route.ts` | Checks duplicate capture (`order.status === 'PAID'`), fetches order via `getPayPalOrder()`, verifies `custom_id`/`reference_id`, `amount.value`, and `currency_code`, calls `capturePayPalOrder()`, verifies captured amount, updates `Payment` to `COMPLETED`, transitions to `PAID`, writes `VERIFY_PAYMENT` `AuditLog`. |
| Payments Ledger API | `src/app/api/payments/route.ts`, `src/app/api/payments/[id]/route.ts` | Lists and fetches `Payment` records for the Transactions page. |
| Approvals & Checkout UI | `src/app/(dashboard)/dashboard/approvals/page.tsx` | Wraps page in `<PayPalScriptProvider>`, renders `<PayPalButtons>` for `APPROVED`/`PAYMENT_PENDING` orders. |
| Transactions Ledger UI | `src/app/(dashboard)/dashboard/transactions/page.tsx` | Displays `Payment` history in AG Grid with `paypalOrderId`, `captureId`, and `idempotencyKey`. |

### 2.2 Exact Sandbox Flow & Storage (`[CODE]`)

1. **Create Order:** `createPayPalOrder` sends `intent: 'CAPTURE'`, `reference_id: order.id`, `custom_id: order.id`, `amount.value` from `centsToString(order.totalAmount)`, and item breakdown. `Payment` stores `status: 'CREATED'`, `paypalOrderId`, `amount` (cents), `idempotencyKey`, `rawResponse`.
2. **Buyer Approval:** `<PayPalButtons>` opens PayPal Sandbox popup; buyer logs into sandbox personal account and approves.
3. **Capture & Verification:** `capture-order` calls `getPayPalOrder()`, checks `unit.custom_id === order.id || unit.reference_id === order.id`, checks `unit.amount.value === centsToString(order.totalAmount)` and `currency_code`, checks if already captured, otherwise calls `capturePayPalOrder()`.
4. **Stored:** `Payment` updated with `status: 'COMPLETED'`, `captureId`, `rawResponse`. `PurchaseOrder` transitioned to `PAID`. Two `AuditLog` entries created (`CAPTURE_PAYPAL_ORDER`, `VERIFY_PAYMENT`).

### 2.3 Honest Assessment: Is PayPal Visibly Central or Only at the Last Step?

PayPal is **architecturally central to financial execution** (server-side Orders v2, policy re-validation at checkout, `custom_id` & amount verification, duplicate-capture protection, audit logs, and a dedicated Transactions ledger), **and all payments strictly route through PayPal Sandbox Orders v2** on `/dashboard/approvals` (and `/dashboard/transactions`).

---

## 3. Original-Idea Checklist

| Requirement | Status | Evidence | File Path | Notes |
| :--- | :--- | :--- | :--- | :--- |
| Receipt upload & AI extraction | **Done** | `[CODE]` | `src/app/api/receipts/upload/route.ts`, `src/services/receipts/extraction.ts` | Supports JPEG/PNG/WebP ≤5MB, Gemini/OpenAI vision, Zod validation, manual fallback. |
| Receipt confirmation & stock deduction | **Done** | `[CODE]` | `src/app/api/receipts/[id]/confirm/route.ts` | Atomic Prisma tx deducts stock (clamped ≥0), logs `StockMovement` & `AuditLog`. |
| Duplicate-receipt guard | **Done** | `[CODE]` | `src/app/api/receipts/upload/route.ts` (L43-63) | SHA-256 `fileHash` checked against `CONFIRMED` receipts; returns HTTP 409. |
| Receipt-triggered agent run | **Partial** | `[CODE]` | `src/app/(dashboard)/dashboard/receipts/page.tsx` (L506-520), `src/app/api/agent/run/route.ts` | Does **not** auto-trigger on confirm; shows a "Launch Restock Agent" link to `/dashboard/ai-procurement` where user must click Run. |
| Channel3 search & details (real API, no mock) | **Done** | `[CODE]` | `src/services/channel3/index.ts` | Live `fetch` to `https://api.trychannel3.com/v1/search` and `/v1/products/{id}`. Zero mock data found via `git grep`. |
| Agent tools & loop | **Partial** | `[CODE]` | `src/services/agent/runner.ts`, `src/services/agent/tools.ts` | 12-iteration loop, 7 exposed tools; however `request_approval` trusts LLM-supplied `totalAmount`/`unitPrice` instead of server-recomputing. |
| Policy engine rules | **Done** | `[RAN]` | `src/services/policy/index.ts`, `tests/policy.test.ts` | 15/15 unit tests pass. Checks positive amount, integer quantities, monthly/owner budget, min rating, approval gate. |
| Proposal schema validation | **Partial** | `[CODE]` | `src/services/agent/tools.ts` (L59-106) | Zod validates types, but `request_approval` does not cross-check prices against `SupplierProduct` or `create_purchase_proposal`. |
| Approval flow | **Done** | `[RAN]` | `src/app/api/procurement/orders/[id]/approve/route.ts`, `reject/route.ts`, `src/services/procurement/stateMachine.ts` | 10/10 state machine tests pass. UI policy checklist on `approvals/page.tsx` is hardcoded, though. |
| PayPal create & capture | **Done** | `[RAN]` | `src/services/paypal/index.ts`, `src/app/api/payments/create-order/route.ts`, `capture-order/route.ts` | 7/7 PayPal unit tests pass. Live sandbox flow `[ASSUMED]` (not run without DB/browser). |
| Amount, currency & `custom_id` verification | **Done** | `[CODE]` | `src/app/api/payments/capture-order/route.ts` (L84-166) | Verifies `custom_id`/`reference_id`, `amount.value`, `currency_code` pre- and post-capture. |
| Idempotency | **Partial** | `[CODE]` | `src/app/api/payments/create-order/route.ts` (L132), `capture-order/route.ts` (L147) | Sends `PayPal-Request-Id`, but keys use `Date.now()`, so two concurrent clicks generate different keys instead of deduplicating. |
| Duplicate-capture protection | **Done** | `[CODE]` | `src/app/api/payments/capture-order/route.ts` (L52-64, L135-145), `src/services/paypal/index.ts` (L284-299) | Checks `order.status === 'PAID'`, checks `existingCapture`, and catches `ORDER_ALREADY_CAPTURED` (422). |
| Audit log | **Done** | `[CODE]` | `prisma/schema.prisma`, `stateMachine.ts`, `capture-order/route.ts`, `confirm/route.ts`, `receive/route.ts` | Immutable `AuditLog` entries for confirm, approve, reject, cancel, create/capture/verify/fail payment, mark received. |
| Restock on receipt | **Done** | `[CODE]` | `src/app/api/procurement/orders/[id]/receive/route.ts` | Increments `Product.currentStock`, records `StockMovement` (`source: 'order'`), logs `MARK_RECEIVED`. |
| Sales velocity | **Done** | `[CODE]` | `src/services/inventory.ts` (L227-269), `src/services/agent/tools.ts` (L434-489), `src/services/policy/index.ts` (L47-58) | 30-day `StockMovement` aggregation + `ceil(avgDailySales * 14)` cover target. |
| Prompt-injection defenses | **Partial** | `[CODE]` | `src/services/ai/gemini.ts` (L188), `openai.ts` (L122), `runner.ts` (L28), `tools.ts` (L509-544) | System prompts warn against untrusted text and Channel3 titles/descriptions are sliced, but no structural delimiters or output cross-check in `request_approval`. |
| Integer-cents everywhere | **Done** | `[RAN]` | `git grep -n -E "parseFloat\|toFixed\|\* 100\|/ 100" src/` | All DB columns, PayPal math (`centsToString`/`stringToCents`), and policy math use integer cents; floats only at UI/API boundary (`dollarsToCents`) and display formatting. |
| AG Grid usage | **Done** | `[CODE]` | `InventoryPage.tsx`, `receipts/page.tsx`, `approvals/page.tsx`, `transactions/page.tsx` | Used in all 4 operational tables (including editable line-item grid on Receipts). |
| Deployment config | **Partial** | `[CODE]` | `render.yaml`, `DEPLOY.md`, `src/app/api/health/route.ts` | `render.yaml` exists and `/api/health` checks DB, but `render.yaml` sets `GEMINI_MODEL=gemini-2.5-flash` which the code ignores. |
| README | **Done** | `[CODE]` | `README.md` | Clear setup, architecture diagram, env vars, demo reset, AI models, and honest scope. |
| LICENSE | **Done** | `[CODE]` | `LICENSE` | MIT License present. |
| AI models list | **Partial** | `[CODE]` | `README.md` (L168-177), `src/services/ai/gemini.ts` (L48) | `README.md` lists `gemini-2.5-flash` and `gpt-4o`, whereas code actually defaults to `gemini-3.1-flash-lite`. |
| Tests | **Partial** | `[RAN]` | `tests/*.test.ts` | 38 unit tests pass (`npm test`), but `agent.e2e.test.ts` fails and `e2e.flow.test.ts` skips without a local Postgres server. |

---

## 4. Differences from the Plan

1. **`GEMINI_MODEL` Env Var Ignored (`[CODE]`):** `README.md`, `.env.example`, and `render.yaml` specify `GEMINI_MODEL="gemini-2.5-flash"`, but `src/services/ai/factory.ts` calls `new GeminiProvider()` without passing `process.env.GEMINI_MODEL`, so `GeminiProvider` always uses `'gemini-3.1-flash-lite'`.
2. **Manual Agent Launch After Receipt (`[CODE]`):** Confirming a receipt does not automatically start the procurement run; it shows a link to `/dashboard/ai-procurement` where the user must click to run.
3. **Hardcoded Policy Checklist in Approvals UI (`[CODE]`):** `src/app/(dashboard)/dashboard/approvals/page.tsx` (lines 650–673) renders static `PASS` / `ACTIVE` badges instead of real `PolicyEvaluation` results from the backend.
4. **No Automated ESLint Config (`[RAN]`):** `npm run lint` cannot run non-interactively because `.eslintrc.json` is missing and `next.config.js` sets `ignoreDuringBuilds: true`.
5. **Extra Features Added (`[CODE]`):** `/dashboard/product-discovery` standalone Channel3 search & comparison page, bulk discount insight card on Receipts, and `scripts/demo-reset.ts` with 3 pre-generated receipt PNGs in `public/demo-receipts/`.

---

## 5. Bugs and Risks

1. **CRITICAL — `request_approval` Trusts LLM Prices & Totals (`[CODE]`):** In `src/services/agent/tools.ts` (L848–873), `request_approval` writes `parsed.totalAmount` and `item.unitPrice` directly from LLM tool arguments into `PurchaseOrder` without recomputing from `SupplierProduct` or running `validatePurchasePolicy`. Prompt injection or hallucination could create a `$0.01` or `$99,999` order.
2. **HIGH — Checkout Policy Re-validation Drops `rating` (`[CODE]`):** In `src/app/api/payments/create-order/route.ts` (L108–119), `drafts` omits `rating`, so `SUPPLIER_RATING_THRESHOLD` is never enforced at checkout (`typeof i.rating === 'number'` is false).
3. **HIGH — `GEMINI_MODEL` Hardcoded (`[CODE]`):** `src/services/ai/gemini.ts` (L48) ignores `process.env.GEMINI_MODEL`. If `gemini-3.1-flash-lite` is unavailable or rate-limited on a user's key, changing `GEMINI_MODEL` in `.env` or Render has no effect.
4. **MEDIUM — No Authentication on Any API Route (`[CODE]`):** All routes use `getDemoUser()` (`demo@stockpilot.ai`). Acceptable for single-user hackathon judging, but high risk if deployed publicly on Render without basic auth or rate limiting.
5. **MEDIUM — Race Conditions & Weak Idempotency Keys (`[CODE]`):**
   - `create-order` (L132) and `capture-order` (L147) use `Date.now()` in `idempotencyKey`, so rapid double-clicks create distinct PayPal requests.
   - `receive/route.ts` (L39–51) checks `existingMovement` outside `prisma.$transaction`, allowing concurrent double-restock on simultaneous POSTs.
6. **MEDIUM — `search_products` Links Supplier Rows to Arbitrary First Product (`[CODE]`):** `src/services/agent/tools.ts` (L502–506) links all Channel3 search results to `allProducts[0]?.id` regardless of which product is being sourced.
7. **LOW — Background Agent Run on Render Free Tier (`[CODE]`):** `POST /api/agent/run` uses `void runProcurementAgent(...)` fire-and-forget. Works in a persistent Node process (`npm start`), but Render free tier spins down idle services and can drop in-flight background promises or lose in-memory PayPal OAuth `cachedToken`.
8. **LOW — E2E Tests Fail Without Running DB (`[RAN]`):** `npm run test:all` fails unless PostgreSQL is running and migrated at `DATABASE_URL`.

---

## 6. Demo Readiness

**Verdict:** **Partially Ready — Needs DB + Env Keys + Verification Before Recording.**  
The production build compiles (`[RAN]`), unit tests pass (`[RAN]`), and the code path from receipt upload → stock deduction → agent run → approval → PayPal Sandbox → restock is wired (`[CODE]`), but it has **not** been verified end-to-end against a running PostgreSQL database, live Gemini/Channel3 keys, and PayPal Sandbox in this audit (`[ASSUMED]`).

### Exact Click Path & Status

1. Start Postgres, configure `.env`, run `npx prisma db push && npm run demo:reset && npm run dev` → `[ASSUMED]` (Postgres was down during audit).
2. Open `http://localhost:3000/dashboard` → `[ASSUMED]`.
3. Go to **Receipts** (`/dashboard/receipts`), upload `public/demo-receipts/receipt-bulk-discount.png` → `[CODE]` (requires `GEMINI_API_KEY`).
4. Review AG Grid lines, click **Confirm Receipt & Deduct Stock** → `[CODE]`.
5. Click **Launch Restock Agent** → redirects to `/dashboard/ai-procurement` → `[CODE]`.
6. Click **Run Autonomous Agent** → polls `agent/runs/[id]/activities` → creates `AWAITING_APPROVAL` order → `[CODE]` (requires `GEMINI_API_KEY` + `CHANNEL3_API_KEY`).
7. Go to **Approvals** (`/dashboard/approvals`), select order, click **Approve & Enable Payment** → `[CODE]`.
8. Click **PayPal** button, log into PayPal Sandbox Buyer account, approve payment → `[ASSUMED]` (requires `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and a Sandbox Buyer account).
9. Click **Mark as Received (Add to Inventory)** → stock increments → `[CODE]`.
10. Open **Transactions** (`/dashboard/transactions`) to show `captureId` and audit trail → `[CODE]`.

### Prerequisites to Set Up First
- Running PostgreSQL instance (`docker-compose up -d` or local Postgres) + `npx prisma db push && npm run demo:reset`.
- `.env` populated with: `DATABASE_URL`, `GEMINI_API_KEY`, `CHANNEL3_API_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_ENV="sandbox"`.
- PayPal Developer Sandbox **Buyer (Personal)** test account credentials for logging into the popup during recording.

---

## 7. Top 10 Fixes, Prioritized

| # | Fix | Why It Matters | Effort | Breakage Risk | Submission |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **Wire `process.env.GEMINI_MODEL` in `src/services/ai/factory.ts` / `gemini.ts`** | Ensures `render.yaml` and `.env` model settings (`gemini-2.5-flash`) actually take effect. | S (<1h) | Low | **MUST** |
| 2 | **Recompute & policy-validate prices inside `request_approval` (`src/services/agent/tools.ts`)** | Closes the prompt-injection / LLM-hallucinated-price vulnerability before DB write. | M (1–3h) | Medium | **MUST** |
| 3 | **Run & verify full live E2E flow with Postgres + Gemini + Channel3 + PayPal Sandbox** | Confirms zero runtime errors before recording the demo video and submitting. | M (1–3h) | Low | **MUST** |
| 4 | **Add `.eslintrc.json` and fix any lint errors (`npm run lint`)** | Eliminates interactive prompt in CI/judging and catches React hook/type issues. | S (<1h) | Low | Recommended |
| 5 | **Pass `rating` into `validatePurchasePolicy` in `create-order/route.ts`** | Ensures supplier rating gate is genuinely re-validated at checkout. | S (<1h) | Low | Recommended |
| 6 | **Render real `PolicyEvaluation` checks in `approvals/page.tsx`** | Replaces hardcoded `PASS` badges with honest server-backed policy status. | M (1–3h) | Low | Recommended |
| 7 | **Move `existingMovement` check inside `prisma.$transaction` in `receive/route.ts` & stabilize `idempotencyKey`** | Eliminates double-restock race condition and makes PayPal retries truly idempotent. | S (<1h) | Low | Recommended |
| 8 | **Link `SupplierProduct` to the actual target product in `search_products` / `create_purchase_proposal`** | Prevents polluting `allProducts[0]` with unrelated supplier records. | S (<1h) | Low | Nice to have |
| 9 | **Auto-trigger or 1-click run agent directly from Receipt Confirmation** | Tightens the "autonomous" story so owners don't have to click Run twice. | M (1–3h) | Medium | Nice to have |
| 10 | **Clean up unused files & ensure public repository is pristine** | Professionalism and audit compliance. | S (<1h) | Low | Nice to have |

---

## 8. Submission Checklist

| Hackathon Requirement | Status | Notes / Gaps |
| :--- | :--- | :--- |
| Working functional demo (not static UI) | **Partial** | Builds and unit-tests pass `[RAN]`; full live DB + PayPal Sandbox flow needs runtime verification `[ASSUMED]`. |
| Public GitHub repo | `[ASSUMED]` | Remote `origin/main` exists; verify repo visibility is Public and commit/clean dirty working tree before submitting. |
| Open-source `LICENSE` | **Done** | MIT License at `LICENSE` `[CODE]`. |
| `README.md` with setup | **Done** | Comprehensive setup, env table, demo reset, and architecture `[CODE]`. |
| List of AI models & tools used | **Partial** | Listed in `README.md` Section 10, but `GEMINI_MODEL` mismatch (`gemini-2.5-flash` vs `gemini-3.1-flash-lite` in code) should be aligned. |
| PayPal & AI meaningfully integrated | **Done** | Real Gemini/OpenAI tool-calling + Vision OCR and real PayPal Orders v2 create/get/capture. |
| Test instructions with sandbox info | **Done** | Documented in `README.md` and `DEPLOY.md` (add explicit note on using a PayPal Sandbox Buyer account). |
| Demo video under 3 minutes | **Missing** | Needs to be recorded after verifying live flow. |

