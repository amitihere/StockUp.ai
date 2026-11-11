import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDemoUser } from '@/services/inventory'
import { PurchaseOrderStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await getDemoUser()
    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status')

    const where: { userId: string; status?: PurchaseOrderStatus } = {
      userId: user.id,
    }

    if (
      statusParam &&
      Object.values(PurchaseOrderStatus).includes(statusParam as PurchaseOrderStatus)
    ) {
      where.status = statusParam as PurchaseOrderStatus
    }

    const orders = await prisma.purchaseOrder.findMany({
      where,
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                category: true,
                currentStock: true,
                minStock: true,
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
          select: {
            id: true,
            status: true,
            triggerType: true,
            startedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ data: orders })
  } catch (error) {
    console.error('Error fetching purchase orders:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch purchase orders' },
      { status: 500 }
    )
  }
}

