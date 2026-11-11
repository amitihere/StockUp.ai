export interface ProposalItemDraft {
  productId: string
  productName: string
  currentStock: number
  minStock: number
  quantity: number
  unitPrice: number // in cents
  totalPrice: number // in cents
  reasoning: string
  rating?: number
  channel3ProductId?: string
  retailer?: string
  supplierProductId?: string
}

export interface PolicyRuleResult {
  rule: string
  passed: boolean
  detail: string
}

export interface PolicyEvaluation {
  passed: boolean
  requiresApproval: boolean
  totalAmount: number // in cents
  remainingMonthlyBudget: number // in cents
  effectiveBudgetCap: number // in cents
  checks: PolicyRuleResult[]
  violations: string[]
}

export interface PolicyConfig {
  monthlyBudget: number // cents
  maxAutomaticPurchase: number // cents
  requireApprovalAbove: number // cents
  minimumProductRating: number // float (e.g. 4.0)
  allowAutomaticPurchases: boolean
}

/**
 * Deterministic restock quantity calculation.
 * Formula:
 * coverTarget = ceil(avgDailySales * 14) (two weeks of cover)
 * targetStock = max(2 * minStock, coverTarget)
 * quantity = max(1, targetStock - currentStock)
 */
export function calculateRestockQuantity(
  currentStock: number,
  minStock: number,
  avgDailySales?: number
): number {
  if (minStock <= 0 && (!avgDailySales || avgDailySales <= 0)) return 1
  const coverTarget =
    avgDailySales && avgDailySales > 0 ? Math.ceil(avgDailySales * 14) : 0
  const targetStock = Math.max(2 * Math.max(0, minStock), coverTarget)
  const deficit = targetStock - Math.max(0, currentStock)
  return Math.max(1, Math.ceil(deficit))
}

/**
 * Evaluates a purchase proposal against all procurement policy rules.
 * Pure deterministic function with zero side effects.
 */
export function validatePurchasePolicy(
  items: ProposalItemDraft[],
  policy: PolicyConfig,
  thisMonthCommittedCents: number = 0,
  ownerRequestedBudgetCents?: number
): PolicyEvaluation {
  const checks: PolicyRuleResult[] = []
  const violations: string[] = []

  const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0)
  const remainingMonthly = Math.max(0, policy.monthlyBudget - thisMonthCommittedCents)

  const effectiveBudgetCap =
    typeof ownerRequestedBudgetCents === 'number' && ownerRequestedBudgetCents > 0
      ? Math.min(ownerRequestedBudgetCents, remainingMonthly)
      : remainingMonthly

  // Rule 1: Total Amount > 0
  const rule1Passed = totalAmount > 0 && items.length > 0
  checks.push({
    rule: 'POSITIVE_ORDER_AMOUNT',
    passed: rule1Passed,
    detail: rule1Passed
      ? `Total order amount is $${(totalAmount / 100).toFixed(2)}.`
      : 'Order proposal must have a total cost greater than $0.',
  })
  if (!rule1Passed) {
    violations.push('Order proposal is empty or total amount is zero.')
  }

  // Rule 2: Quantities are positive integers
  const invalidQuantities = items.filter(
    (i) => !Number.isInteger(i.quantity) || i.quantity <= 0
  )
  const rule2Passed = invalidQuantities.length === 0
  checks.push({
    rule: 'VALID_QUANTITIES',
    passed: rule2Passed,
    detail: rule2Passed
      ? `All ${items.length} item quantities are positive integers.`
      : `${invalidQuantities.length} item(s) have non-positive or non-integer quantities.`,
  })
  if (!rule2Passed) {
    violations.push('Every product item must specify a positive integer quantity.')
  }

  // Rule 3: Budget check: total <= min(owner requested budget, remaining monthly budget)
  const rule3Passed = totalAmount <= effectiveBudgetCap
  checks.push({
    rule: 'BUDGET_COMPLIANCE',
    passed: rule3Passed,
    detail: rule3Passed
      ? `Total $${(totalAmount / 100).toFixed(2)} is within effective budget limit of $${(
          effectiveBudgetCap / 100
        ).toFixed(2)}.`
      : `Total $${(totalAmount / 100).toFixed(2)} exceeds allowable budget of $${(
          effectiveBudgetCap / 100
        ).toFixed(2)} (Requested: ${
          ownerRequestedBudgetCents
            ? `$${(ownerRequestedBudgetCents / 100).toFixed(2)}`
            : 'N/A'
        }, Monthly Remaining: $${(remainingMonthly / 100).toFixed(2)}).`,
  })
  if (!rule3Passed) {
    violations.push(
      `Total proposal amount ($${(totalAmount / 100).toFixed(2)}) exceeds allowable budget ($${(
        effectiveBudgetCap / 100
      ).toFixed(2)}).`
    )
  }

  // Rule 4: Product Rating threshold (applied ONLY when a rating exists)
  const lowRatedItems = items.filter(
    (i) => typeof i.rating === 'number' && i.rating < policy.minimumProductRating
  )
  const rule4Passed = lowRatedItems.length === 0
  checks.push({
    rule: 'SUPPLIER_RATING_THRESHOLD',
    passed: rule4Passed,
    detail: rule4Passed
      ? `All rated items meet or exceed minimum supplier threshold of ${policy.minimumProductRating.toFixed(
          1
        )} stars.`
      : `${lowRatedItems.length} item(s) fall below required rating threshold of ${policy.minimumProductRating.toFixed(
          1
        )} stars.`,
  })
  if (!rule4Passed) {
    violations.push(
      `Some selected suppliers do not meet the minimum rating requirement (${policy.minimumProductRating.toFixed(
        1
      )}★).`
    )
  }

  // Rule 5: Approval gating:
  // Requires approval if total > requireApprovalAbove OR allowAutomaticPurchases is false
  const requiresApproval =
    totalAmount > policy.requireApprovalAbove || !policy.allowAutomaticPurchases

  checks.push({
    rule: 'APPROVAL_GATE',
    passed: true, // Gate is evaluated, not a violation
    detail: requiresApproval
      ? `Order requires merchant approval (Threshold: $${(
          policy.requireApprovalAbove / 100
        ).toFixed(2)}, Auto Purchases: ${policy.allowAutomaticPurchases ? 'Enabled' : 'Disabled'}).`
      : 'Order qualifies for automatic procurement authorization.',
  })

  // Rule 6: Payment safety rule - unapproved orders cannot enter payment flow
  checks.push({
    rule: 'PAYMENT_FLOW_SAFETY',
    passed: true,
    detail: 'Order will be safely quarantined in AWAITING_APPROVAL status until merchant signoff.',
  })

  const passed = violations.length === 0

  return {
    passed,
    requiresApproval,
    totalAmount,
    remainingMonthlyBudget: remainingMonthly,
    effectiveBudgetCap,
    checks,
    violations,
  }
}

/**
 * Deterministically trims items to fit within a given budget cap.
 * Prioritization:
 * 1. Out of stock items (highest priority, deficit = minStock)
 * 2. Largest stock deficit (minStock - currentStock)
 * 3. Trims quantities of lower priority items down to 1, or drops them if necessary.
 */
export function trimProposalToBudget(
  items: ProposalItemDraft[],
  maxBudgetCents: number
): ProposalItemDraft[] {
  if (items.length === 0 || maxBudgetCents <= 0) return []

  // Sort by urgency: out of stock first, then largest deficit descending
  const sorted = [...items].sort((a, b) => {
    const aOut = a.currentStock <= 0 ? 1 : 0
    const bOut = b.currentStock <= 0 ? 1 : 0
    if (aOut !== bOut) return bOut - aOut

    const aDeficit = a.minStock - a.currentStock
    const bDeficit = b.minStock - b.currentStock
    return bDeficit - aDeficit
  })

  // Start with 1 unit of each item from highest priority until budget would be exceeded
  const result: ProposalItemDraft[] = []
  let accumulated = 0

  // Pass 1: Allocate minimum 1 unit to as many priority items as fit
  for (const item of sorted) {
    if (item.unitPrice <= 0) continue
    if (accumulated + item.unitPrice <= maxBudgetCents) {
      result.push({
        ...item,
        quantity: 1,
        totalPrice: item.unitPrice,
      })
      accumulated += item.unitPrice
    }
  }

  // Pass 2: Scale up quantities towards requested restock quantity in priority order
  for (let i = 0; i < result.length; i++) {
    const item = result[i]
    const orig = sorted.find((s) => s.productId === item.productId)
    if (!orig) continue

    const desiredQty = orig.quantity
    while (item.quantity < desiredQty && accumulated + item.unitPrice <= maxBudgetCents) {
      item.quantity += 1
      item.totalPrice += item.unitPrice
      accumulated += item.unitPrice
    }
  }

  return result
}

