import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDemoUser } from '@/services/inventory'

export const dynamic = 'force-dynamic'

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getDemoUser()
    const orderId = params.id

    const order = await prisma.purchaseOrder.findFirst({
      where: {
        id: orderId,
        userId: user.id,
      },
      include: {
        items: true,
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    if (order.status !== 'PAID') {
      return NextResponse.json(
        {
          error: `Cannot mark order as received with status "${order.status}". Only PAID orders can be received into inventory.`,
        },
        { status: 400 }
      )
    }

    // Check if already received
    const existingMovement = await prisma.stockMovement.findFirst({
      where: {
        referenceId: order.id,
        source: 'order',
      },
    })

    if (existingMovement) {
      return NextResponse.json(
        { error: 'This purchase order has already been received into inventory.' },
        { status: 400 }
      )
    }

    // Execute inventory restock inside transaction
    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        // Increment stock
        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: {
              increment: item.quantity,
            },
          },
        })

        // Record stock movement audit
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            change: item.quantity,
            source: 'order',
            referenceId: order.id,
          },
        })
      }

      // Record audit log
      await tx.auditLog.create({
        data: {
          action: 'MARK_RECEIVED',
          entityType: 'PURCHASE_ORDER',
          entityId: order.id,
          userId: user.id,
          details: {
            itemsReceivedCount: order.items.length,
            totalUnits: order.items.reduce((sum, i) => sum + i.quantity, 0),
          },
        },
      })
    })

    return NextResponse.json({
      data: {
        id: order.id,
        received: true,
        message: 'Order items received successfully! Store inventory quantities have been updated.',
      },
    })
  } catch (error) {
    console.error('Error marking order as received:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to receive order into inventory' },
      { status: 500 }
    )
  }
}

