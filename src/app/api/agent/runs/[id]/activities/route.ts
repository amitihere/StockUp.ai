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

    // Confirm run belongs to user
    const run = await prisma.procurementRun.findFirst({
      where: {
        id: runId,
        userId: user.id,
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        completedAt: true,
      },
    })

    if (!run) {
      return NextResponse.json({ error: 'Procurement run not found' }, { status: 404 })
    }

    const activities = await prisma.agentActivity.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      data: {
        run,
        activities,
      },
    })
  } catch (error) {
    console.error('Error fetching activities:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve activities' },
      { status: 500 }
    )
  }
}

