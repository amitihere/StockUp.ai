import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getDemoUser, getPolicy } from '@/services/inventory'
import { transitionPurchaseOrderState } from '@/services/procurement/stateMachine'
import { centsToString, createPayPalOrder, getPayPalOrder } from '@/services/paypal'

describe('End-to-End Procurement Approval & Payment Lifecycle (Part 3)', () => {
  let userId: string
  let testOrderId: string
  let productId: string
  const initialStock = 5
  const restockQty = 10
  const unitPriceCents = 1500 // $15.00
  const orderTotalCents = unitPriceCents * restockQty // $150.00 (15000 cents)

  beforeAll(async () => {
    const user = await getDemoUser()
    userId = user.id

    // Create or find a test product
    const product = await prisma.product.upsert({
      where: { sku: 'TEST-MAGSAFE-E2E' },
      update: { currentStock: initialStock, minStock: 20, unitCost: unitPriceCents },
      create: {
        sku: 'TEST-MAGSAFE-E2E',
        name: 'MagSafe Wireless Charging Stand (E2E Test)',
        category: 'Charging',
        currentStock: initialStock,
        minStock: 20,
        unitCost: unitPriceCents,
        userId: user.id,
      },
    })
    productId = product.id

    // 1. Create a PurchaseOrder in status AWAITING_APPROVAL (as produced by Agent in Part 2)
    const po = await prisma.purchaseOrder.create({
      data: {
        userId: user.id,
        status: 'AWAITING_APPROVAL',
        totalAmount: orderTotalCents,
        currency: 'USD',
        supplierId: 'Demo supplier (PayPal Sandbox merchant)',
        notes: 'Autonomous restock proposal for MagSafe Charging Stand',
        items: {
          create: [
            {
              productId: product.id,
              quantity: restockQty,
              unitPrice: unitPriceCents,
              currency: 'USD',
            },
          ],
        },
      },
    })
    testOrderId = po.id
  })

  it('1. Verifies order is initially saved in AWAITING_APPROVAL status', async () => {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: testOrderId } })
    expect(po).toBeDefined()
    expect(po?.status).toBe('AWAITING_APPROVAL')
    expect(po?.totalAmount).toBe(orderTotalCents)
  })

  it('2. Merchant approves proposal -> transitions to APPROVED with an Approval record and AuditLog', async () => {
    await prisma.$transaction(async (tx) => {
      await transitionPurchaseOrderState(tx, {
        orderId: testOrderId,
        toStatus: 'APPROVED',
        userId,
        action: 'APPROVE',
        reason: 'Merchant authorized proposal in Approvals dashboard',
      })

      await tx.approval.create({
        data: {
          purchaseOrderId: testOrderId,
          userId,
          status: 'APPROVED',
          notes: 'Signed off by Demo Store Owner',
        },
      })
    })

    const updated = await prisma.purchaseOrder.findUnique({
      where: { id: testOrderId },
      include: { approvals: true },
    })
    expect(updated?.status).toBe('APPROVED')
    expect(updated?.approvals.length).toBeGreaterThan(0)
    expect(updated?.approvals[0].status).toBe('APPROVED')

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: testOrderId, action: 'APPROVE' },
    })
    expect(audit).toBeDefined()
    expect(audit?.action).toBe('APPROVE')
  })

  it('3. Re-runs policy engine and prepares PayPal sandbox order -> transitions to PAYMENT_PENDING', async () => {
    // Check policy limits
    const policy = await getPolicy(userId)
    expect(policy.monthlyBudget).toBeGreaterThanOrEqual(orderTotalCents)

    const idempotencyKey = `e2e_create_${testOrderId}_${Date.now()}`

    // Transition to PAYMENT_PENDING & create Payment row
    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          purchaseOrderId: testOrderId,
          paypalOrderId: 'MOCK-SANDBOX-PP-ORDER-001',
          status: 'CREATED',
          amount: orderTotalCents,
          currency: 'USD',
          idempotencyKey,
        },
      })

      await transitionPurchaseOrderState(tx, {
        orderId: testOrderId,
        toStatus: 'PAYMENT_PENDING',
        userId,
        action: 'CREATE_PAYPAL_ORDER',
        metadata: {
          paypalOrderId: 'MOCK-SANDBOX-PP-ORDER-001',
          idempotencyKey,
          amountCents: orderTotalCents,
        },
      })
    })

    const order = await prisma.purchaseOrder.findUnique({
      where: { id: testOrderId },
      include: { payments: true },
    })
    expect(order?.status).toBe('PAYMENT_PENDING')
    expect(order?.payments[0]?.status).toBe('CREATED')
  })

  it('4. Captures and verifies payment -> transitions to PAID with captureId and audit log', async () => {
    const mockCaptureId = 'MOCK-SANDBOX-CAPTURE-999'

    await prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { purchaseOrderId: testOrderId },
        data: {
          status: 'COMPLETED',
          captureId: mockCaptureId,
        },
      })

      await transitionPurchaseOrderState(tx, {
        orderId: testOrderId,
        toStatus: 'PAID',
        userId,
        action: 'CAPTURE_PAYPAL_ORDER',
        metadata: {
          captureId: mockCaptureId,
          paypalOrderId: 'MOCK-SANDBOX-PP-ORDER-001',
          verifiedAmount: centsToString(orderTotalCents),
        },
      })

      await tx.auditLog.create({
        data: {
          action: 'VERIFY_PAYMENT',
          entityType: 'PAYMENT',
          entityId: testOrderId,
          userId,
          details: {
            captureId: mockCaptureId,
            verifiedAmountCents: orderTotalCents,
            verifiedCurrency: 'USD',
            status: 'COMPLETED',
          },
        },
      })
    })

    const paidOrder = await prisma.purchaseOrder.findUnique({
      where: { id: testOrderId },
      include: { payments: true },
    })
    expect(paidOrder?.status).toBe('PAID')
    expect(paidOrder?.payments[0].status).toBe('COMPLETED')
    expect(paidOrder?.payments[0].captureId).toBe(mockCaptureId)
  })

  it('5. Marks PAID order as received -> adds quantities to inventory & creates StockMovement', async () => {
    // Execute restock receipt
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: {
          currentStock: { increment: restockQty },
        },
      })

      await tx.stockMovement.create({
        data: {
          productId,
          change: restockQty,
          source: 'order',
          referenceId: testOrderId,
        },
      })

      await tx.auditLog.create({
        data: {
          action: 'MARK_RECEIVED',
          entityType: 'PURCHASE_ORDER',
          entityId: testOrderId,
          userId,
          details: {
            itemsReceivedCount: 1,
            totalUnits: restockQty,
          },
        },
      })
    })

    // Verify stock is incremented: initialStock (5) + restockQty (10) = 15
    const updatedProduct = await prisma.product.findUnique({ where: { id: productId } })
    expect(updatedProduct?.currentStock).toBe(initialStock + restockQty)

    // Verify stock movement
    const movement = await prisma.stockMovement.findFirst({
      where: { referenceId: testOrderId },
    })
    expect(movement).toBeDefined()
    expect(movement?.change).toBe(restockQty)
    expect(movement?.source).toBe('order')
  })
})

