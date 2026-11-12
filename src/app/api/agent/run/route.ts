import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDemoUser } from '@/services/inventory'
import { runProcurementAgent } from '@/services/agent/runner'
import { dollarsToCents } from '@/lib/utils'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const runRequestSchema = z
  .object({
    prompt: z.string().trim().optional(),
    budgetDollars: z.coerce.number().min(1).optional(),
    receiptId: z.string().optional(),
    productIds: z.array(z.string()).optional(),
  })
  .refine(
    (data) =>
      (data.prompt && data.prompt.length > 0) ||
      (Array.isArray(data.productIds) && data.productIds.length > 0),
    {
      message: 'Either prompt or productIds must be provided',
      path: ['prompt'],
    }
  )

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

    const { prompt, budgetDollars, receiptId, productIds } = validation.data
    const ownerBudgetCents = budgetDollars ? dollarsToCents(budgetDollars) : undefined

    // Build server-generated prompt when productIds are provided
    let effectivePrompt = prompt?.trim() || ''

    if (productIds && productIds.length > 0) {
      const targetedProducts = await prisma.product.findMany({
        where: {
          userId: user.id,
          id: { in: productIds },
        },
      })

      if (targetedProducts.length > 0) {
        const productDescriptions = targetedProducts
          .map(
            (p) => `${p.name} (SKU: ${p.sku}, current stock: ${p.currentStock}, minimum: ${p.minStock})`
          )
          .join(', ')
        const generatedPrompt = `Restock these products: ${productDescriptions}. Prioritize quality and value, stay within the remaining monthly budget.`
        if (!effectivePrompt) {
          effectivePrompt = generatedPrompt
        }
      } else if (!effectivePrompt) {
        effectivePrompt = 'Restock targeted low-stock products within the remaining monthly budget.'
      }
    }

    // 1. Create a ProcurementRun record in RUNNING status
    const run = await prisma.procurementRun.create({
      data: {
        status: 'RUNNING',
        triggerType: receiptId ? 'RECEIPT' : productIds && productIds.length > 0 ? 'LOW_STOCK' : 'MANUAL',
        userId: user.id,
        receiptId: receiptId || null,
      },
    })

    // 2. Start the autonomous agent loop asynchronously in the background
    void runProcurementAgent({
      runId: run.id,
      userId: user.id,
      userPrompt: effectivePrompt,
      ownerBudgetCents,
      productIds,
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

