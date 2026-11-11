export interface PayPalTokenResponse {
  scope: string
  access_token: string
  token_type: string
  app_id: string
  expires_in: number
  nonce: string
}

export interface PayPalAmount {
  currency_code: string
  value: string
  breakdown?: {
    item_total?: {
      currency_code: string
      value: string
    }
  }
}

export interface PayPalItem {
  name: string
  unit_amount: {
    currency_code: string
    value: string
  }
  quantity: string
  description?: string
  sku?: string
}

export interface PayPalPurchaseUnit {
  reference_id?: string
  custom_id?: string
  description?: string
  amount: PayPalAmount
  items?: PayPalItem[]
  payments?: {
    captures?: PayPalCapture[]
  }
}

export interface PayPalCapture {
  id: string
  status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED' | 'FAILED'
  amount: {
    currency_code: string
    value: string
  }
  final_capture?: boolean
  seller_protection?: {
    status: string
  }
  seller_receivable_breakdown?: {
    gross_amount: { currency_code: string; value: string }
    paypal_fee?: { currency_code: string; value: string }
    net_amount?: { currency_code: string; value: string }
  }
  create_time?: string
  update_time?: string
}

export interface PayPalOrder {
  id: string
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED'
  intent: 'CAPTURE' | 'AUTHORIZE'
  purchase_units: PayPalPurchaseUnit[]
  create_time?: string
  links?: Array<{
    href: string
    rel: string
    method: string
  }>
}

export interface PayPalCaptureResponse {
  id: string
  status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED' | 'FAILED'
  purchase_units: Array<{
    reference_id?: string
    payments?: {
      captures?: PayPalCapture[]
    }
  }>
  payer?: {
    name?: { given_name?: string; surname?: string }
    email_address?: string
    payer_id?: string
  }
}

export interface CreatePayPalOrderInput {
  purchaseOrderId: string
  totalAmountCents: number
  currency?: string
  idempotencyKey: string
  items: Array<{
    name: string
    quantity: number
    unitPriceCents: number
    sku?: string
  }>
}

