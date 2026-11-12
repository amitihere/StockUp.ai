import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDemoUser, getPolicy } from '@/services/inventory'
import { createPayPalOrder } from '@/services/paypal'
import { transitionPurchaseOrderState } from '@/services/procurement/stateMachine'
import { validatePurchasePolicy, ProposalItemDraft } from '@/services/policy'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const createOrderSchema = z.object({
  purchaseOrderId: z.string().min(1, 'Purchase order ID is required'),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getDemoUser()
    const body = await request.json().catch(() => ({}))
    const parsed = createOrderSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { purchaseOrderId } = parsed.data

    // 1. Fetch purchase order with items and product details directly from database
    const order = await prisma.purchaseOrder.findFirst({
      where: {
        id: purchaseOrderId,
        userId: user.id,
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    // 2. Strict precondition: Order must be APPROVED (or PAYMENT_PENDING with an existing PayPal order to retry)
    if (order.status === 'PAYMENT_PENDING') {
      const existingPayment = await prisma.payment.findFirst({
        where: {
          purchaseOrderId: order.id,
          status: 'CREATED',
          paypalOrderId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
      })

      if (existingPayment?.paypalOrderId) {
        return NextResponse.json({
          data: {
            purchaseOrderId: order.id,
            paypalOrderId: existingPayment.paypalOrderId,
            status: 'PAYMENT_PENDING',
          },
        })
      }

      return NextResponse.json(
        {
          error: 'Order is in PAYMENT_PENDING status without an active PayPal order. Please cancel and recreate the order.',
        },
        { status: 400 }
      )
    }

    if (order.status !== 'APPROVED') {
      return NextResponse.json(
        {
          error: `Purchase order must be in APPROVED status to create a payment order. Current status: "${order.status}".`,
        },
        { status: 400 }
      )
    }

    // 3. RE-RUN Policy Engine at this moment (budget or stock may have changed)
    const policy = await getPolicy(user.id)
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const otherCommittedOrders = await prisma.purchaseOrder.findMany({
      where: {
        userId: user.id,
        id: { not: order.id },
        createdAt: { gte: startOfMonth },
        status: { in: ['APPROVED', 'PAYMENT_PENDING', 'PAID'] },
      },
      select: { totalAmount: true },
    })

    const thisMonthCommittedCents = otherCommittedOrders.reduce(
      (sum, o) => sum + o.totalAmount,
      0
    )

    const productIds = order.items.map((item) => item.productId)
    const supplierProducts = await prisma.supplierProduct.findMany({
      where: {
        productId: { in: productIds },
      },
    })

    const drafts: ProposalItemDraft[] = order.items.map((item) => {
      const sp =
        supplierProducts.find(
          (s) =>
            s.productId === item.productId &&
            (s.supplierId === order.supplierId || s.externalName === order.supplierId)
        ) || supplierProducts.find((s) => s.productId === item.productId)

      return {
        productId: item.productId,
        productName: item.product.name,
        currentStock: item.product.currentStock,
        minStock: item.product.minStock,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.unitPrice * item.quantity,
        reasoning: 'Re-validated before payment initialization',
        rating: sp?.rating,
        retailer: sp?.externalName || order.supplierId,
        channel3ProductId: sp?.supplierId,
        supplierProductId: sp?.id,
      }
    })

    const evaluation = validatePurchasePolicy(drafts, policy, thisMonthCommittedCents)
    if (!evaluation.passed) {
      return NextResponse.json(
        {
          error: 'Procurement policy check failed at checkout time.',
          violations: evaluation.violations,
          remainingBudget: evaluation.remainingMonthlyBudget,
        },
        { status: 400 }
      )
    }

    // 4. Create unique idempotency key
    const idempotencyKey = `create_${order.id}_${Date.now()}`

    // 5. Call PayPal Orders API (v2/checkout/orders) using server-side credentials
    const paypalOrder = await createPayPalOrder({
      purchaseOrderId: order.id,
      totalAmountCents: order.totalAmount,
      currency: order.currency,
      idempotencyKey,
      items: order.items.map((item) => ({
        name: item.product.name,
        quantity: item.quantity,
        unitPriceCents: item.unitPrice,
        sku: item.product.sku,
      })),
    })

    // 6. Save Payment row (status CREATED) and transition order to PAYMENT_PENDING in transaction
    await prisma.$transaction(async (tx) => {
      // Create Payment record
      await tx.payment.create({
        data: {
          purchaseOrderId: order.id,
          paypalOrderId: paypalOrder.id,
          status: 'CREATED',
          amount: order.totalAmount,
          currency: order.currency,
          idempotencyKey,
          rawResponse: paypalOrder as any,
        },
      })

      // Move order state to PAYMENT_PENDING
      await transitionPurchaseOrderState(tx, {
        orderId: order.id,
        toStatus: 'PAYMENT_PENDING',
        userId: user.id,
        action: 'CREATE_PAYPAL_ORDER',
        metadata: {
          paypalOrderId: paypalOrder.id,
          idempotencyKey,
          amountCents: order.totalAmount,
        },
      })
    })

    return NextResponse.json({
      data: {
        purchaseOrderId: order.id,
        paypalOrderId: paypalOrder.id,
        status: 'PAYMENT_PENDING',
      },
    })
  } catch (error) {
    console.error('Error creating PayPal order:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create payment order' },
      { status: 500 }
    )
  }
}

