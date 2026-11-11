import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDemoUser } from '@/services/inventory'
import { runProcurementAgent } from '@/services/agent/runner'
import { dollarsToCents } from '@/lib/utils'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const runRequestSchema = z.object({
  prompt: z.string().trim().min(1, 'Prompt is required'),
  budgetDollars: z.coerce.number().min(1).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getDemoUser()
    const body: unknown = await request.json().catch(() => null)
    const validation = runRequestSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { prompt, budgetDollars } = validation.data
    const ownerBudgetCents = budgetDollars ? dollarsToCents(budgetDollars) : undefined

    // 1. Create a ProcurementRun record in RUNNING status
    const run = await prisma.procurementRun.create({
      data: {
        status: 'RUNNING',
        triggerType: 'MANUAL',
        userId: user.id,
      },
    })

    // 2. Start the autonomous agent loop asynchronously in the background
    void runProcurementAgent({
      runId: run.id,
      userId: user.id,
      userPrompt: prompt,
      ownerBudgetCents,
    }).catch(async (error) => {
      console.error(`Agent run ${run.id} failed:`, error)
      await prisma.procurementRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
        },
      }).catch(() => null)
    })

    // 3. Return runId immediately
    return NextResponse.json(
      {
        data: {
          runId: run.id,
          status: 'RUNNING',
          startedAt: run.startedAt,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error starting agent run:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to launch agent run' },
      { status: 500 }
    )
  }
}

