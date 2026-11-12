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

describe('Agent Tools — Hard Restock Scope Enforcement (productIds in context)', () => {
  const mockUserId = 'user-123'
  const mockRunId = 'run-456'
  const inScopeProductId = 'prod-in-scope'
  const outOfScopeProductId = 'prod-out-of-scope'

  const inScopeProduct = {
    id: inScopeProductId,
    name: 'USB-C Cable 2M',
    sku: 'CBL-2M',
    category: 'Cables',
    currentStock: 1,
    minStock: 10,
    unitCost: 500,
    currency: 'USD',
    userId: mockUserId,
  }

  const outOfScopeProduct = {
    id: outOfScopeProductId,
    name: 'Wireless Mouse',
    sku: 'MSE-WL',
    category: 'Peripherals',
    currentStock: 0,
    minStock: 5,
    unitCost: 1500,
    currency: 'USD',
    userId: mockUserId,
  }

  const sampleSupplierProduct = {
    id: 'prod-in-scope_c3-offer-1',
    productId: inScopeProductId,
    supplierId: 'c3-offer-1',
    externalName: 'Cables Wholesale',
    price: 450,
    currency: 'USD',
    rating: 4.6,
    leadTimeDays: 2,
    inStock: true,
  }

  const samplePolicy = {
    id: 'policy-1',
    monthlyBudget: 200000,
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
    vi.mocked(prisma.product.findMany).mockResolvedValue([inScopeProduct] as any)
    vi.mocked(prisma.supplierProduct.findFirst).mockResolvedValue(sampleSupplierProduct as any)
    vi.mocked(prisma.supplierProduct.upsert).mockResolvedValue(sampleSupplierProduct as any)
    vi.mocked(prisma.purchaseOrder.create).mockImplementation((args: any) =>
      Promise.resolve({
        id: 'po-scope-order-1',
        ...args.data,
      })
    )
  })

  it('get_low_stock_products queries only products in scope when productIds is provided', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([inScopeProduct] as any)

    const result = await executeAgentTool(
      'get_low_stock_products',
      {},
      { userId: mockUserId, runId: mockRunId, productIds: [inScopeProductId] }
    )

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: {
        userId: mockUserId,
        id: { in: [inScopeProductId] },
      },
    })
    expect(result.lowStockProducts).toHaveLength(1)
    expect((result.lowStockProducts as any[])[0].id).toBe(inScopeProductId)
  })

  it('create_purchase_proposal REJECTS any item whose productId is not in scope', async () => {
    const result = await executeAgentTool(
      'create_purchase_proposal',
      {
        items: [
          {
            productId: outOfScopeProductId,
            channel3ProductId: 'c3-offer-1',
            quantity: 5,
            reasoning: 'Attempting to restock out of scope product',
          },
        ],
      },
      { userId: mockUserId, runId: mockRunId, productIds: [inScopeProductId] }
    )

    expect(result.error).toBe('OUT_OF_SCOPE_PRODUCT')
    expect(result.message).toContain(outOfScopeProductId)
  })

  it('request_approval REJECTS any item whose productId is not in scope and refuses to create order', async () => {
    const result = await executeAgentTool(
      'request_approval',
      {
        items: [
          {
            productId: outOfScopeProductId,
            quantity: 5,
          },
        ],
      },
      { userId: mockUserId, runId: mockRunId, productIds: [inScopeProductId] }
    )

    expect(result.error).toBe('OUT_OF_SCOPE_PRODUCT')
    expect(result.message).toContain(outOfScopeProductId)
    expect(prisma.purchaseOrder.create).not.toHaveBeenCalled()
  })

  it('request_approval succeeds when all items are strictly in scope', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([inScopeProduct] as any)
    vi.mocked(prisma.supplierProduct.findFirst).mockResolvedValue(sampleSupplierProduct as any)

    const result = await executeAgentTool(
      'request_approval',
      {
        items: [
          {
            productId: inScopeProductId,
            quantity: 5,
          },
        ],
      },
      { userId: mockUserId, runId: mockRunId, productIds: [inScopeProductId] }
    )

    expect(result.success).toBe(true)
    expect(prisma.purchaseOrder.create).toHaveBeenCalled()
  })
})
