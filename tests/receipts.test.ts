import { describe, it, expect } from 'vitest'
import {
  receiptLineSchema,
  receiptExtractionSchema,
  validateReceiptTotals,
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
