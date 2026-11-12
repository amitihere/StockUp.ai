import { describe, it, expect } from 'vitest'
import {
  receiptLineSchema,
  receiptExtractionSchema,
  validateReceiptTotals,
  cleanJsonOutput,
  parseReceiptJson,
  parseCents,
} from '@/services/receipts/schema'
import { matchReceiptLineToProduct } from '@/services/receipts/matching'
import { Product } from '@prisma/client'

describe('Receipt Core Zod Validation', () => {
  it('validates a correct extracted receipt payload', () => {
    const raw = {
      merchant: 'Metro Electronics Wholesale',
      date: '2026-11-10',
      currency: 'USD',
      lines: [
        {
          description: 'USB-C Fast Charger 20W PD',
          sku: 'CHG-USBC-20W',
          quantity: 15,
          unitPriceCents: 1499,
          discountCents: 1500,
          lineTotalCents: 20985, // 15 * 1499 - 1500 = 22485 - 1500 = 20985
        },
      ],
      totalCents: 20985,
    }

    const parsed = receiptExtractionSchema.parse(raw)
    expect(parsed.merchant).toBe('Metro Electronics Wholesale')
    expect(parsed.lines.length).toBe(1)
    expect(parsed.totalCents).toBe(20985)

    const totalsCheck = validateReceiptTotals(parsed)
    expect(totalsCheck.totalsMatch).toBe(true)
    expect(totalsCheck.discrepancyCents).toBe(0)
  })

  it('detects and flags discrepancies between line items and total', () => {
    const raw = {
      merchant: 'Downtown Tech Depot',
      date: '2026-11-10',
      currency: 'USD',
      lines: [
        {
          description: 'HDMI Cable 4K 2m',
          sku: 'CBL-HDMI21-2M',
          quantity: 2,
          unitPriceCents: 899,
          discountCents: 0,
          lineTotalCents: 1798,
        },
      ],
      totalCents: 2500, // Discrepancy of 702 cents
    }

    const parsed = receiptExtractionSchema.parse(raw)
    const totalsCheck = validateReceiptTotals(parsed)
    expect(totalsCheck.totalsMatch).toBe(false)
    expect(totalsCheck.discrepancyCents).toBe(702)
    expect(totalsCheck.lineSumCents).toBe(1798)
  })

  it('rejects invalid quantities or negative amounts', () => {
    expect(() =>
      receiptLineSchema.parse({
        description: 'Bad Line',
        quantity: 0, // Must be positive int
        unitPriceCents: 100,
        lineTotalCents: 100,
      })
    ).toThrow()

    expect(() =>
      receiptLineSchema.parse({
        description: 'Negative Price Line',
        quantity: 1,
        unitPriceCents: -500,
        lineTotalCents: -500,
      })
    ).toThrow()
  })
})

describe('Receipt Product Matching Algorithm', () => {
  const mockProducts: Product[] = [
    {
      id: 'prod_magsafe',
      name: 'MagSafe Wireless Charging Stand',
      sku: 'CHG-MAGSAFE-STD',
      category: 'Charging',
      currentStock: 10,
      minStock: 15,
      unitCost: 2499,
      currency: 'USD',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: 'user_1',
    },
    {
      id: 'prod_hdmi',
      name: 'High-Speed 4K HDMI 2.1 Cable (2m)',
      sku: 'CBL-HDMI21-2M',
      category: 'Cables',
      currentStock: 8,
      minStock: 20,
      unitCost: 899,
      currency: 'USD',
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: 'user_1',
    },
  ]

  it('matches exactly by SKU with 1.0 confidence', () => {
    const match = matchReceiptLineToProduct(
      { description: 'Wireless Mag Charger', sku: 'CHG-MAGSAFE-STD' },
      mockProducts
    )
    expect(match.matchedProductId).toBe('prod_magsafe')
    expect(match.confidence).toBe(1.0)
    expect(match.matchedProductSku).toBe('CHG-MAGSAFE-STD')
  })

  it('matches by token similarity when SKU is absent', () => {
    const match = matchReceiptLineToProduct(
      { description: 'MagSafe Wireless Charging Stand' },
      mockProducts
    )
    expect(match.matchedProductId).toBe('prod_magsafe')
    expect(match.confidence).toBeGreaterThan(0.6)
  })

  it('returns null (needs matching) when similarity is below threshold', () => {
    const match = matchReceiptLineToProduct(
      { description: 'Alkaline AA Batteries 24 Pack' },
      mockProducts
    )
    expect(match.matchedProductId).toBeNull()
  })
})

describe('Tolerant Receipt Vision Parser (Unit Tests)', () => {
  it('strips markdown ```json code fences and extracts JSON', () => {
    const fenced = '```json\n{\n  "merchant": "Best Buy",\n  "totalCents": 5000,\n  "lines": []\n}\n```'
    const cleaned = cleanJsonOutput(fenced)
    const parsed = JSON.parse(cleaned)
    expect(parsed.merchant).toBe('Best Buy')
    expect(parsed.totalCents).toBe(5000)
  })

  it('strips generic ``` code fences with conversational prefix and suffix', () => {
    const text = 'Here is the extracted transaction data:\n```\n{\n  "merchant": "Target",\n  "totalCents": 1299,\n  "lines": []\n}\n```\nHope this helps!'
    const cleaned = cleanJsonOutput(text)
    const parsed = JSON.parse(cleaned)
    expect(parsed.merchant).toBe('Target')
    expect(parsed.totalCents).toBe(1299)
  })

  it('tolerantly converts dollar floats to integer cents', () => {
    expect(parseCents(14.99)).toBe(1499)
    expect(parseCents(0.5)).toBe(50)
    expect(parseCents(120)).toBe(120) // Integer remains 120 cents
  })

  it('tolerantly converts dollar strings ($14.99, $0.00) to integer cents', () => {
    expect(parseCents('$14.99')).toBe(1499)
    expect(parseCents('$129.50')).toBe(12950)
    expect(parseCents('$0.00')).toBe(0)
  })

  it('parses receipts with missing optional fields (invoiceNumber, customer, discountCents)', () => {
    const input = {
      merchant: 'Corner Store',
      date: '2026-11-12',
      lines: [
        {
          description: 'USB-C Cable',
          quantity: 2,
          unitPriceCents: 999,
          // discountCents omitted
          // lineTotalCents omitted -> auto-calculated
        },
      ],
      totalCents: 1998,
    }

    const result = parseReceiptJson(input)
    expect(result.merchant).toBe('Corner Store')
    expect(result.invoiceNumber).toBeNull()
    expect(result.customer).toBeNull()
    expect(result.lines[0].discountCents).toBe(0)
    expect(result.lines[0].lineTotalCents).toBe(1998)
    expect(result.totalCents).toBe(1998)
  })

  it('auto-computes totalCents from lines sum when total is 0 or absent', () => {
    const input = {
      merchant: 'Hardware Depot',
      lines: [
        {
          description: 'Power Strip',
          quantity: 1,
          unitPriceCents: 2499,
          lineTotalCents: 2499,
        },
        {
          description: 'Cat6 Cable',
          quantity: 2,
          unitPriceCents: 750,
          lineTotalCents: 1500,
        },
      ],
    }

    const result = parseReceiptJson(input)
    expect(result.totalCents).toBe(3999)
    const totalsCheck = validateReceiptTotals(result)
    expect(totalsCheck.totalsMatch).toBe(true)
  })

  it('parses raw valid JSON string without markdown fences', () => {
    const raw = JSON.stringify({
      merchant: 'Corner Market',
      invoiceNumber: 'INV-1001',
      customer: 'Alice',
      currency: 'USD',
      lines: [
        {
          description: 'AA Batteries 4pk',
          quantity: 2,
          unitPriceCents: 499,
          lineTotalCents: 998,
        },
      ],
      totalCents: 998,
    })

    const result = parseReceiptJson(raw)
    expect(result.merchant).toBe('Corner Market')
    expect(result.invoiceNumber).toBe('INV-1001')
    expect(result.customer).toBe('Alice')
    expect(result.lines).toHaveLength(1)
    expect(result.totalCents).toBe(998)
    expect(validateReceiptTotals(result).totalsMatch).toBe(true)
  })

  it('tolerantly handles completely missing merchant, customer, and invoiceNumber', () => {
    const input = {
      lines: [
        {
          description: 'Generic Item',
          quantity: 1,
          unitPriceCents: 500,
          lineTotalCents: 500,
        },
      ],
      totalCents: 500,
    }

    const result = parseReceiptJson(input)
    expect(result.merchant).toBe('Store Receipt')
    expect(result.customer).toBeNull()
    expect(result.invoiceNumber).toBeNull()
    expect(result.totalCents).toBe(500)
    expect(validateReceiptTotals(result).totalsMatch).toBe(true)
  })

  it('negative test: throws on invalid non-JSON text', () => {
    const badInput = 'This is an error message: Service Unavailable (503)'
    expect(() => parseReceiptJson(badInput)).toThrow()
  })

  it('negative test: throws on malformed JSON payload missing curly braces', () => {
    const malformed = 'merchant: "Test", total: 100'
    expect(() => parseReceiptJson(malformed)).toThrow()
  })
})

