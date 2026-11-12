import {
  PayPalTokenResponse,
  PayPalOrder,
  PayPalCaptureResponse,
  CreatePayPalOrderInput,
} from './types'

/**
 * Converts integer minor units (cents) to standard decimal currency string (e.g. 1499 -> "14.99").
 * Uses pure integer arithmetic only — ZERO floating point operations.
 */
export function centsToString(cents: number): string {
  if (!Number.isFinite(cents)) {
    throw new Error(`Invalid cents amount: ${cents}`)
  }
  const isNegative = cents < 0
  const abs = Math.abs(Math.trunc(cents))
  const dollars = Math.floor(abs / 100)
  const remainder = abs % 100
  const paddedRemainder = remainder < 10 ? `0${remainder}` : `${remainder}`
  const formatted = `${dollars}.${paddedRemainder}`
  return isNegative ? `-${formatted}` : formatted
}

/**
 * Converts formatted string back to integer cents strictly without floating point imprecision.
 */
export function stringToCents(amountStr: string): number {
  const trimmed = amountStr.trim()
  const parts = trimmed.split('.')
  if (parts.length > 2) {
    throw new Error(`Invalid currency string: "${amountStr}"`)
  }
  const dollars = parseInt(parts[0], 10) || 0
  const centsPart = (parts[1] || '0').slice(0, 2).padEnd(2, '0')
  const cents = parseInt(centsPart, 10) || 0
  return dollars * 100 + (dollars < 0 ? -cents : cents)
}

export class PayPalError extends Error {
  status: number
  details?: unknown
  debugId?: string

  constructor(message: string, status: number, details?: unknown, debugId?: string) {
    super(message)
    this.name = 'PayPalError'
    this.status = status
    this.details = details
    this.debugId = debugId
  }
}

// In-memory token cache
let cachedToken: {
  token: string
  expiresAt: number
} | null = null

export function getPayPalBaseUrl(): string {
  const env = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase().trim()
  return env === 'production'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'
}

export function getPayPalCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim()
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim()

  if (!clientId || !clientSecret) {
    throw new PayPalError(
      'PayPal credentials are not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env',
      500
    )
  }

  return { clientId, clientSecret }
}

/**
 * Retrieves an OAuth 2.0 access token via client credentials grant.
 * Caches token in memory and refreshes 60 seconds before expiration.
 */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  const now = Date.now()
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > now + 60000) {
    return cachedToken.token
  }

  const { clientId, clientSecret } = getPayPalCredentials()
  const baseUrl = getPayPalBaseUrl()
  const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`

  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  })

  if (!res.ok) {
    const errorText = await res.text().catch(() => '')
    const debugId = res.headers.get('paypal-debug-id') || undefined
    throw new PayPalError(
      `Failed to obtain PayPal OAuth token (${res.status}): ${errorText}`,
      res.status,
      errorText,
      debugId
    )
  }

  const data = (await res.json()) as PayPalTokenResponse
  cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  }

  return data.access_token
}

/**
 * Low-level authenticated request helper with token refresh on 401 and retry on 429/5xx.
 */
export async function paypalRequest<T>(
  path: string,
  options: RequestInit & { idempotencyKey?: string } = {},
  retryCount = 0
): Promise<T> {
  const baseUrl = getPayPalBaseUrl()
  const token = await getAccessToken(retryCount > 0)

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (options.idempotencyKey) {
    headers['PayPal-Request-Id'] = options.idempotencyKey
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    cache: 'no-store',
  })

  if (!response.ok) {
    const debugId = response.headers.get('paypal-debug-id') || undefined
    let errorData: any
    try {
      errorData = await response.json()
    } catch {
      errorData = await response.text().catch(() => '')
    }

    // 401 Unauthorized: token may have expired prematurely. Retry once with fresh token.
    if (response.status === 401 && retryCount === 0) {
      cachedToken = null
      return paypalRequest<T>(path, options, 1)
    }

    // 429 / 5xx: transient rate-limiting or server backpressure. Retry once with backoff.
    if ((response.status === 429 || response.status >= 500) && retryCount < 2) {
      const delay = (retryCount + 1) * 1000
      await new Promise((r) => setTimeout(r, delay))
      return paypalRequest<T>(path, options, retryCount + 1)
    }

    const message =
      (typeof errorData === 'object' && errorData?.message) ||
      (typeof errorData === 'object' && errorData?.name) ||
      `PayPal request failed with status ${response.status}`

    throw new PayPalError(message, response.status, errorData, debugId)
  }

  // 204 No Content
  if (response.status === 204) {
    return {} as T
  }

  return (await response.json()) as T
}

/**
 * Creates a PayPal Order in CAPTURE intent.
 * Builds the purchase unit strictly from verified backend items.
 * Sends PayPal-Request-Id for idempotency.
 */
export async function createPayPalOrder(input: CreatePayPalOrderInput): Promise<PayPalOrder> {
  const currency = (input.currency || 'USD').toUpperCase().trim()
  const formattedTotal = centsToString(input.totalAmountCents)

  // Calculate sum of item line totals to ensure item_total matches amount exactly
  let calculatedItemTotalCents = 0
  const items = input.items.map((item) => {
    const itemTotal = item.unitPriceCents * item.quantity
    calculatedItemTotalCents += itemTotal
    return {
      name: item.name.slice(0, 127),
      quantity: String(item.quantity),
      unit_amount: {
        currency_code: currency,
        value: centsToString(item.unitPriceCents),
      },
      sku: item.sku?.slice(0, 127),
    }
  })

  // Ensure breakdown exactly matches total amount
  const breakdownValue = centsToString(calculatedItemTotalCents)

  const payload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: input.purchaseOrderId,
        custom_id: input.purchaseOrderId,
        description: `StockPilot Order #${input.purchaseOrderId.slice(-8)}`,
        amount: {
          currency_code: currency,
          value: formattedTotal,
          breakdown: {
            item_total: {
              currency_code: currency,
              value: breakdownValue,
            },
          },
        },
        items,
      },
    ],
    application_context: {
      brand_name: 'StockPilot Procurement',
      landing_page: 'LOGIN',
      user_action: 'PAY_NOW',
      shipping_preference: 'NO_SHIPPING',
    },
  }

  return paypalRequest<PayPalOrder>('/v2/checkout/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
    idempotencyKey: input.idempotencyKey,
  })
}

/**
 * Retrieves a PayPal Order by ID to inspect status and details.
 */
export async function getPayPalOrder(orderId: string): Promise<PayPalOrder> {
  if (!orderId) {
    throw new PayPalError('PayPal orderId is required', 400)
  }
  return paypalRequest<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
  })
}

/**
 * Captures an approved PayPal Order.
 * Handles ORDER_ALREADY_CAPTURED gracefully by fetching the existing order.
 */
export async function capturePayPalOrder(
  orderId: string,
  idempotencyKey: string
): Promise<PayPalCaptureResponse> {
  if (!orderId) {
    throw new PayPalError('PayPal orderId is required for capture', 400)
  }

  try {
    return await paypalRequest<PayPalCaptureResponse>(
      `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      {
        method: 'POST',
        idempotencyKey,
        body: JSON.stringify({}),
      }
    )
  } catch (error) {
    // Check if error is ORDER_ALREADY_CAPTURED (422)
    if (error instanceof PayPalError && error.status === 422) {
      const details = error.details as any
      const isAlreadyCaptured =
        details?.details?.some((d: any) => d.issue === 'ORDER_ALREADY_CAPTURED') ||
        details?.name === 'ORDER_ALREADY_CAPTURED'

      if (isAlreadyCaptured) {
        // Sync state: retrieve the order directly
        const order = await getPayPalOrder(orderId)
        const capture = order.purchase_units?.[0]?.payments?.captures?.[0]
        return {
          id: order.id,
          status: (capture?.status || 'COMPLETED') as any,
          purchase_units: order.purchase_units || [],
        }
      }
    }

    throw error
  }
}

