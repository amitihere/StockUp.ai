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
    const paymentId = params.id

    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        purchaseOrder: {
          userId: user.id,
        },
      },
      include: {
        purchaseOrder: {
          include: {
            items: {
              include: {
                product: true,
              },
            },
            procurementRun: true,
          },
        },
      },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Payment record not found' }, { status: 404 })
    }

    // Fetch related audit logs
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: payment.id },
          { entityId: payment.purchaseOrderId },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      data: {
        ...payment,
        auditLogs,
      },
    })
  } catch (error) {
    console.error('Error fetching payment details:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch payment details' },
      { status: 500 }
    )
  }
}

