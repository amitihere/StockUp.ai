import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDemoUser } from '@/services/inventory'
import { transitionPurchaseOrderState } from '@/services/procurement/stateMachine'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const rejectSchema = z.object({
  notes: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getDemoUser()
    const orderId = params.id
    const body = await request.json().catch(() => ({}))
    const parsed = rejectSchema.safeParse(body)
    const notes = parsed.success ? parsed.data.notes : undefined

    const order = await prisma.purchaseOrder.findFirst({
      where: {
        id: orderId,
        userId: user.id,
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    if (order.status !== 'AWAITING_APPROVAL') {
      return NextResponse.json(
        {
          error: `Cannot reject order with status "${order.status}". Only AWAITING_APPROVAL orders can be rejected.`,
        },
        { status: 400 }
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Transition state to CANCELLED
      const po = await transitionPurchaseOrderState(tx, {
        orderId: order.id,
        toStatus: 'CANCELLED',
        userId: user.id,
        action: 'REJECT',
        reason: notes || 'Proposal rejected by store owner',
      })

      // 2. Create Approval record with REJECTED status
      await tx.approval.create({
        data: {
          purchaseOrderId: order.id,
          userId: user.id,
          status: 'REJECTED',
          notes: notes || 'Rejected by store owner',
        },
      })

      return po
    })

    return NextResponse.json({
      data: {
        id: updated.id,
        status: updated.status,
        message: 'Purchase order rejected and cancelled.',
      },
    })
  } catch (error) {
    console.error('Error rejecting order:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reject purchase order' },
      { status: 500 }
    )
  }
}

