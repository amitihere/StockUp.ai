import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDemoUser } from '@/services/inventory'
import { transitionPurchaseOrderState } from '@/services/procurement/stateMachine'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const approveSchema = z.object({
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
    const parsed = approveSchema.safeParse(body)
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
          error: `Cannot approve order with status "${order.status}". Only AWAITING_APPROVAL orders can be approved.`,
        },
        { status: 400 }
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Transition state to APPROVED (stateMachine verifies & creates AuditLog)
      const po = await transitionPurchaseOrderState(tx, {
        orderId: order.id,
        toStatus: 'APPROVED',
        userId: user.id,
        action: 'APPROVE',
        reason: notes || 'Merchant approved proposal for execution',
      })

      // 2. Create Approval record
      await tx.approval.create({
        data: {
          purchaseOrderId: order.id,
          userId: user.id,
          status: 'APPROVED',
          notes: notes || 'Approved by store owner',
        },
      })

      return po
    })

    return NextResponse.json({
      data: {
        id: updated.id,
        status: updated.status,
        message: 'Purchase order approved. Ready for PayPal payment authorization.',
      },
    })
  } catch (error) {
    console.error('Error approving order:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to approve purchase order' },
      { status: 500 }
    )
  }
}

