import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  centsToString,
  stringToCents,
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrder,
  PayPalError,
} from '@/services/paypal'

describe('PayPal Financial Serialization (centsToString)', () => {
  it('converts typical dollar-cent amounts with zero floating point drift', () => {
    expect(centsToString(1499)).toBe('14.99')
    expect(centsToString(5999)).toBe('59.99')
    expect(centsToString(899)).toBe('8.99')
    expect(centsToString(100)).toBe('1.00')
    expect(centsToString(0)).toBe('0.00')
  })

  it('pads single-digit cent remainders properly', () => {
    expect(centsToString(105)).toBe('1.05')
    expect(centsToString(5)).toBe('0.05')
    expect(centsToString(50)).toBe('0.50')
  })

  it('handles large amounts accurately without precision loss', () => {
    expect(centsToString(100000000)).toBe('1000000.00') // $1M
    expect(centsToString(254321)).toBe('2543.21')
  })

  it('handles negative cents if encountered', () => {
    expect(centsToString(-450)).toBe('-4.50')
  })

  it('round-trips through stringToCents accurately', () => {
    expect(stringToCents('14.99')).toBe(1499)
    expect(stringToCents('0.05')).toBe(5)
    expect(stringToCents('100.00')).toBe(10000)
    expect(stringToCents('250')).toBe(25000)
  })
})

describe('PayPal Amount & Currency Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.PAYPAL_CLIENT_ID = 'mock-client-id'
    process.env.PAYPAL_CLIENT_SECRET = 'mock-client-secret'
    process.env.PAYPAL_ENV = 'sandbox'
  })

  it('builds purchase_units with exact integer item_total matching order total', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/v1/oauth2/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              access_token: 'mock-access-token',
              expires_in: 3600,
            }),
        })
      }
      if (url.includes('/v2/checkout/orders')) {
        const body = JSON.parse(init?.body as string)
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () =>
            Promise.resolve({
              id: 'ORDER-123',
              status: 'CREATED',
              purchase_units: body.purchase_units,
            }),
        })
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    global.fetch = fetchMock as any

    const order = await createPayPalOrder({
      purchaseOrderId: 'po_test_001',
      totalAmountCents: 4998,
      currency: 'USD',
      idempotencyKey: 'idemp-12345',
      items: [
        { name: 'USB-C Cable', quantity: 2, unitPriceCents: 1499 },
        { name: 'Wall Plug', quantity: 1, unitPriceCents: 2000 },
      ],
    })

    expect(order.id).toBe('ORDER-123')
    const unit = order.purchase_units[0]
    expect(unit.reference_id).toBe('po_test_001')
    expect(unit.custom_id).toBe('po_test_001')
    expect(unit.amount.value).toBe('49.98')
    expect(unit.amount.currency_code).toBe('USD')
    expect(unit.amount.breakdown?.item_total?.value).toBe('49.98')
  })

  it('handles duplicate capture via ORDER_ALREADY_CAPTURED gracefully by fetching existing order', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/v1/oauth2/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              access_token: 'mock-access-token',
              expires_in: 3600,
            }),
        })
      }
      if (url.includes('/capture')) {
        // Return 422 with ORDER_ALREADY_CAPTURED issue
        return Promise.resolve({
          ok: false,
          status: 422,
          headers: new Headers(),
          json: () =>
            Promise.resolve({
              name: 'UNPROCESSABLE_ENTITY',
              details: [{ issue: 'ORDER_ALREADY_CAPTURED', description: 'Order has already been captured.' }],
              message: 'The requested action could not be performed.',
            }),
        })
      }
      if (url.includes('/v2/checkout/orders/ORDER-CAPTURED-ALREADY')) {
        // GET order returns the captured status
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              id: 'ORDER-CAPTURED-ALREADY',
              status: 'COMPLETED',
              purchase_units: [
                {
                  payments: {
                    captures: [
                      {
                        id: 'CAPTURE-EXISTING-999',
                        status: 'COMPLETED',
                        amount: { currency_code: 'USD', value: '49.98' },
                      },
                    ],
                  },
                },
              ],
            }),
        })
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    global.fetch = fetchMock as any

    const result = await capturePayPalOrder('ORDER-CAPTURED-ALREADY', 'key-dup-capture')
    expect(result.id).toBe('ORDER-CAPTURED-ALREADY')
    expect(result.status).toBe('COMPLETED')
    expect(result.purchase_units[0].payments?.captures?.[0]?.id).toBe('CAPTURE-EXISTING-999')
  })
})

