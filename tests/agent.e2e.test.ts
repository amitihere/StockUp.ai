import { describe, it, expect } from 'vitest'
import { prisma } from '../src/lib/prisma'
import { getDemoUser } from '../src/services/inventory'
import { runProcurementAgent } from '../src/services/agent/runner'

describe('Autonomous AI Procurement Agent E2E', () => {
  it('runs full agent loop for: Restock my store under $500. Prioritize quality and value.', async () => {
    const user = await getDemoUser()
    expect(user).toBeDefined()

    // 1. Create a procurement run
    const run = await prisma.procurementRun.create({
      data: {
        userId: user.id,
        triggerType: 'MANUAL',
        status: 'RUNNING',
      },
    })
    expect(run.id).toBeDefined()

    console.log(`\n========================================`)
    console.log(`Starting AI Procurement Run: ${run.id}`)
    console.log(`Prompt: "Restock my store under $500. Prioritize quality and value."`)
    console.log(`========================================\n`)

    // 2. Execute the agent runner
    const result = await runProcurementAgent({
      runId: run.id,
      userId: user.id,
      userPrompt: 'Restock my store under $500. Prioritize quality and value.',
      ownerBudgetCents: 50000,
    })

    console.log(`Agent finished in ${result.iterations} iterations. Completed: ${result.completed}`)

    // 3. Inspect logged activities
    const activities = await prisma.agentActivity.findMany({
      where: { runId: run.id },
      orderBy: { createdAt: 'asc' },
    })

    console.log(`\nLogged ${activities.length} Agent Activities:`)
    for (const act of activities) {
      console.log(`- [${act.type}] ${act.toolName}`)
    }

    // 4. Retrieve generated PurchaseOrder
    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { procurementRunId: run.id },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        approvals: true,
      },
    })

    expect(purchaseOrder).toBeDefined()
    if (!purchaseOrder) throw new Error('Purchase order was not created')

    console.log(`\n----------------------------------------`)
    console.log(`PURCHASE PROPOSAL RESULT (ID: ${purchaseOrder.id})`)
    console.log(`Status: ${purchaseOrder.status}`)
    console.log(`Total: $${(purchaseOrder.totalAmount / 100).toFixed(2)} (${purchaseOrder.totalAmount} cents)`)
    console.log(`Supplier / Retailer: ${purchaseOrder.supplierId}`)
    console.log(`Notes: ${purchaseOrder.notes}`)
    console.log(`----------------------------------------`)
    console.log(`Proposed Line Items:`)
    for (const item of purchaseOrder.items) {
      console.log(
        `  • ${item.product.name} (SKU: ${item.product.sku}) | Qty: ${item.quantity} | Unit: $${(
          item.unitPrice / 100
        ).toFixed(2)} | Subtotal: $${((item.quantity * item.unitPrice) / 100).toFixed(2)}`
      )
    }
    console.log(`----------------------------------------\n`)

    expect(purchaseOrder.status).toBe('AWAITING_APPROVAL')
    expect(purchaseOrder.totalAmount).toBeGreaterThan(0)
    expect(purchaseOrder.totalAmount).toBeLessThanOrEqual(50000)
    expect(purchaseOrder.items.length).toBeGreaterThan(0)
  }, 180000)
})
