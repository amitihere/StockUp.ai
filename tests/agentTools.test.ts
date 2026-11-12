import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma and inventory services
vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    supplierProduct: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    purchaseOrder: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    procurementRun: {
      update: vi.fn(),
    },
  },
}))

vi.mock('@/services/inventory', () => ({
  getPolicy: vi.fn(),
  getDemoUser: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getPolicy } from '@/services/inventory'
import { executeAgentTool } from '@/services/agent/tools'

describe('Agent Tools — Server-Side Price Verification in request_approval', () => {
  const mockUserId = 'user-123'
  const mockRunId = 'run-456'
  const mockContext = { userId: mockUserId, runId: mockRunId }

  const sampleProduct = {
    id: 'prod-charger',
    name: 'USB-C Fast Charger 20W',
    sku: 'CHG-20W',
    category: 'Charging',
    currentStock: 2,
    minStock: 10,
    unitCost: 1200,
    currency: 'USD',
    userId: mockUserId,
  }

  const sampleSupplierProduct = {
    id: 'prod-charger_c3-offer-1',
    productId: 'prod-charger',
    supplierId: 'c3-offer-1',
    externalName: 'Anker Official Supplier',
    price: 1499, // $14.99 in integer cents
    currency: 'USD',
    rating: 4.8,
    leadTimeDays: 2,
    inStock: true,
  }

  const samplePolicy = {
    id: 'policy-1',
    monthlyBudget: 200000, // $2,000.00
    maxAutomaticPurchase: 10000,
    requireApprovalAbove: 10000,
    minimumProductRating: 4.0,
    allowAutomaticPurchases: false,
    currency: 'USD',
    userId: mockUserId,
  }

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(getPolicy).mockResolvedValue(samplePolicy as any)
    vi.mocked(prisma.purchaseOrder.findMany).mockResolvedValue([])
    vi.mocked(prisma.product.findMany).mockResolvedValue([sampleProduct] as any)
    vi.mocked(prisma.supplierProduct.findFirst).mockResolvedValue(sampleSupplierProduct as any)
    vi.mocked(prisma.procurementRun.update).mockResolvedValue({ id: mockRunId, status: 'COMPLETED' } as any)
    vi.mocked(prisma.purchaseOrder.create).mockImplementation((args: any) =>
      Promise.resolve({
        id: 'po-test-order-1',
        ...args.data,
      })
    )
  })

  it('ignores model-supplied fake price of 1 cent and uses stored SupplierProduct price', async () => {
    // Model maliciously or hallucinatorily sends unitPrice: 1 ($0.01) and totalAmount: 5 ($0.05)
    const result = await executeAgentTool(
      'request_approval',
      {
        runId: mockRunId,
        items: [
          {
            productId: 'prod-charger',
            quantity: 5,
            unitPrice: 1, // FAKE: 1 cent
            totalPrice: 5, // FAKE: 5 cents
            channel3ProductId: 'c3-offer-1',
            retailer: 'Anker Official Supplier',
          },
        ],
        totalAmount: 5, // FAKE: 5 cents
        notes: 'Replenish low stock chargers',
      },
      mockContext
    )

    expect(result.success).toBe(true)
    expect(result.purchaseOrderId).toBe('po-test-order-1')

    // 5 units * 1499 cents = 7495 cents ($74.95)
    expect(result.totalAmountCents).toBe(7495)
    expect(result.totalAmountFormatted).toBe('$74.95')

    // Verify Prisma purchaseOrder.create was called with the server-recomputed price
    expect(prisma.purchaseOrder.create).toHaveBeenCalledTimes(1)
    const createCall = vi.mocked(prisma.purchaseOrder.create).mock.calls[0][0]

    expect(createCall.data.totalAmount).toBe(7495) // NOT 5 cents
    expect(createCall.data.items.create[0].unitPrice).toBe(1499) // NOT 1 cent
  })

  it('ignores model-supplied astronomical price of $99,999 and uses stored SupplierProduct price', async () => {
    // Model sends unitPrice: 9999900 ($99,999) and totalAmount: 9999900
    const result = await executeAgentTool(
      'request_approval',
      {
        runId: mockRunId,
        items: [
          {
            productId: 'prod-charger',
            quantity: 2,
            unitPrice: 9999900, // FAKE: $99,999.00
            totalPrice: 19999800,
            channel3ProductId: 'c3-offer-1',
          },
        ],
        totalAmount: 19999800,
      },
      mockContext
    )

    expect(result.success).toBe(true)

    // 2 units * 1499 cents = 2998 cents ($29.98)
    expect(result.totalAmountCents).toBe(2998)
    expect(result.totalAmountFormatted).toBe('$29.98')

    const createCall = vi.mocked(prisma.purchaseOrder.create).mock.calls[0][0]
    expect(createCall.data.totalAmount).toBe(2998)
    expect(createCall.data.items.create[0].unitPrice).toBe(1499)
  })

  it('rejects unknown inventory product ID', async () => {
    const result = await executeAgentTool(
      'request_approval',
      {
        items: [
          {
            productId: 'prod-non-existent-999',
            quantity: 5,
          },
        ],
      },
      mockContext
    )

    expect(result.error).toBe('UNKNOWN_PRODUCT')
    expect(prisma.purchaseOrder.create).not.toHaveBeenCalled()
  })

  it('rejects non-integer or non-positive quantities', async () => {
    // Negative quantity
    const resultNegative = await executeAgentTool(
      'request_approval',
      {
        items: [{ productId: 'prod-charger', quantity: -3 }],
      },
      mockContext
    )
    expect(resultNegative.error).toBe('INVALID_QUANTITY')

    // Zero quantity
    const resultZero = await executeAgentTool(
      'request_approval',
      {
        items: [{ productId: 'prod-charger', quantity: 0 }],
      },
      mockContext
    )
    expect(resultZero.error).toBe('INVALID_QUANTITY')

    // Floating-point quantity
    const resultFloat = await executeAgentTool(
      'request_approval',
      {
        items: [{ productId: 'prod-charger', quantity: 2.5 }],
      },
      mockContext
    )
    expect(resultFloat.error).toBe('INVALID_QUANTITY')
    expect(prisma.purchaseOrder.create).not.toHaveBeenCalled()
  })

  it('rejects item if no stored supplier price exists in database', async () => {
    vi.mocked(prisma.supplierProduct.findFirst).mockResolvedValue(null)

    const result = await executeAgentTool(
      'request_approval',
      {
        items: [{ productId: 'prod-charger', quantity: 4 }],
      },
      mockContext
    )

    expect(result.error).toBe('MISSING_STORED_PRICE')
    expect(prisma.purchaseOrder.create).not.toHaveBeenCalled()
  })

  it('refuses to create order if policy engine rules fail on recomputed amounts', async () => {
    // Suppose policy monthly budget is $500 (50000 cents), but recomputed order is 100 units * $14.99 = $1,499.00
    vi.mocked(getPolicy).mockResolvedValue({
      ...samplePolicy,
      monthlyBudget: 50000, // $500 cap
    } as any)

    const result = await executeAgentTool(
      'request_approval',
      {
        items: [{ productId: 'prod-charger', quantity: 100 }], // 100 * $14.99 = $1499 > $500
      },
      mockContext
    )

    expect(result.error).toBe('POLICY_VIOLATION')
    expect(result.violations).toBeDefined()
    expect(prisma.purchaseOrder.create).not.toHaveBeenCalled()
  })
})
