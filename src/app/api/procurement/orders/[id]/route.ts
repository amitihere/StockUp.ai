import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDemoUser } from '@/services/inventory'

export const dynamic = 'force-dynamic'

export async function GET(
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
        items: {
          include: {
            product: {
              include: {
                supplierProducts: {
                  take: 3,
                  orderBy: { price: 'asc' },
                },
              },
            },
          },
        },
        approvals: {
          orderBy: { createdAt: 'desc' },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
        procurementRun: {
          include: {
            agentActivities: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    // Also fetch audit logs for this order
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityId: order.id,
      },
      orderBy: { createdAt: 'asc' },
    })

    // Check if items have been marked received
    const stockMovements = await prisma.stockMovement.findMany({
      where: {
        referenceId: order.id,
        source: 'order',
      },
    })

    return NextResponse.json({
      data: {
        ...order,
        auditLogs,
        stockMovements,
        isReceived: stockMovements.length > 0,
      },
    })
  } catch (error) {
    console.error('Error fetching purchase order details:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch purchase order' },
      { status: 500 }
    )
  }
}

