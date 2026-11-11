import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDemoUser } from '@/services/inventory'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: { id: string } | Promise<{ id: string }>
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getDemoUser()
    const params = await context.params
    const runId = params.id

    const run = await prisma.procurementRun.findFirst({
      where: {
        id: runId,
        userId: user.id,
      },
      include: {
        purchaseOrders: {
          include: {
            items: {
              include: {
                product: true,
              },
            },
            approvals: true,
          },
        },
      },
    })

    if (!run) {
      return NextResponse.json({ error: 'Procurement run not found' }, { status: 404 })
    }

    return NextResponse.json({ data: run })
  } catch (error) {
    console.error('Error fetching procurement run:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch run details' },
      { status: 500 }
    )
  }
}

