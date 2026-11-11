import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDemoUser } from '@/services/inventory'
import { transitionPurchaseOrderState } from '@/services/procurement/stateMachine'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const cancelSchema = z.object({
  reason: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getDemoUser()
    const orderId = params.id
    const body = await request.json().catch(() => ({}))
    const parsed = cancelSchema.safeParse(body)
    const reason = parsed.success ? parsed.data.reason : undefined

    const order = await prisma.purchaseOrder.findFirst({
      where: {
        id: orderId,
        userId: user.id,
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    if (!['APPROVED', 'PAYMENT_PENDING'].includes(order.status)) {
      return NextResponse.json(
        {
          error: `Cannot cancel order with status "${order.status}". Only APPROVED or PAYMENT_PENDING orders can be cancelled.`,
        },
        { status: 400 }
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      return transitionPurchaseOrderState(tx, {
        orderId: order.id,
        toStatus: 'CANCELLED',
        userId: user.id,
        action: 'CANCEL',
        reason: reason || 'Merchant cancelled order',
      })
    })

    return NextResponse.json({
      data: {
        id: updated.id,
        status: updated.status,
        message: 'Purchase order cancelled successfully.',
      },
    })
  } catch (error) {
    console.error('Error cancelling order:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel purchase order' },
      { status: 500 }
    )
  }
}

