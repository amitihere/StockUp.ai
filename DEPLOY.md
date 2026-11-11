# StockPilot Deployment Guide (Render)

This guide walks through deploying **StockPilot** to [Render](https://render.com) using the included Blueprint (`render.yaml`).

> [!NOTE]
> **PayPal Sandbox Mode**: StockPilot operates exclusively with PayPal **Sandbox** credentials for hackathon evaluation and judging. Live commercial PayPal accounts should **never** be used for hackathon testing.

---

## 1. Prerequisites

1. A [Render Account](https://render.com).
2. A GitHub account with a fork of the `StockPilot` repository.
3. API Credentials:
   - **PayPal Developer Sandbox**: Client ID & Client Secret from [developer.paypal.com](https://developer.paypal.com/dashboard/applications/sandbox).
   - **Google Gemini API Key**: From [Google AI Studio](https://aistudio.google.com/).
   - **Channel3 API Key**: Sourcing key from [trychannel3.com](https://trychannel3.com).

---

## 2. One-Click Blueprint Deployment

1. Log into your **Render Dashboard**.
2. Click **New +** in the top navigation and select **Blueprint**.
3. Connect your GitHub repository: select your `StockPilot` fork.
4. Render will parse [`render.yaml`](./render.yaml) and automatically create:
   - **PostgreSQL Database**: `stockpilot-db`
   - **Web Service**: `stockpilot` (Node runtime)

5. Under **Environment Variables**, provide the following secret keys:
   - `NEXT_PUBLIC_PAYPAL_CLIENT_ID`: Your PayPal sandbox client ID (required at build time for client scripts).
   - `PAYPAL_CLIENT_ID`: Your PayPal sandbox client ID.
   - `PAYPAL_CLIENT_SECRET`: Your PayPal sandbox client secret (stored server-side only).
   - `PAYPAL_ENV`: `sandbox`
   - `GEMINI_API_KEY`: Your Gemini API key.
   - `CHANNEL3_API_KEY`: Your Channel3 API key.

6. Click **Apply**. Render will provision the database, build the Next.js application, and deploy.

---

## 3. Build & Runtime Commands

If configuring manually without Blueprints:

- **Build Command**:
  ```bash
  npm ci && npx prisma generate && (npx prisma migrate deploy || npx prisma db push) && npm run build
  ```
- **Start Command**:
  ```bash
  npm start
  ```
- **Health Check Path**:
  ```
  /api/health
  ```

---

## 4. Initializing Seed & Demo Data

Once your service is live:
1. Open your web service in Render, click the **Shell** tab (or connect via Render SSH).
2. Run the demo reset script to seed catalog products and sales velocity history:
   ```bash
   npm run demo:reset
   ```
3. Your deployment is now initialized with 12 electronics products and pre-calculated 30-day velocity metrics.

---

## 5. Verifying Deployment Health

Verify the deployment status using the health check endpoint:
```bash
curl https://<your-render-subdomain>.onrender.com/api/health
```

Expected response:
```json
{
  "status": "ok",
  "service": "stockpilot",
  "timestamp": "2026-11-11T12:00:00.000Z",
  "database": "connected"
}
```

---

## 6. Financial & Security Safeguards

- **Zero Client-Side Amounts**: All order amounts and PayPal payloads are generated strictly on the server from validated database entities.
- **Idempotency Keys**: PayPal `PayPal-Request-Id` headers prevent duplicate charges on network retries.
- **Audit Trails**: Every approval, rejection, and payment capture is recorded immutably in PostgreSQL `AuditLog`.

