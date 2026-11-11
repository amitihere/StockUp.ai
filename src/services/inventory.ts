import { prisma } from '@/lib/prisma'
import { DEMO_USER_EMAIL, OverviewStats } from '@/types'
import { dollarsToCents, isLowStock, isOutOfStock } from '@/lib/utils'
import type { ProductCreateInput, ProductUpdateInput, PolicyUpdateInput } from '@/lib/validations'

/**
 * Retrieves the seeded demo user or creates it if not present.
 * Uses DEMO_USER_EMAIL everywhere since authentication is out of scope for Part 1.
 */
export async function getDemoUser() {
  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: {
      email: DEMO_USER_EMAIL,
      name: 'Demo Store Owner',
    },
  })
  return user
}

/**
 * Lists all products for the demo user.
 */
export async function getProducts(userId: string) {
  return prisma.product.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Finds a single product by ID for the user.
 */
export async function getProductById(id: string, userId: string) {
  return prisma.product.findFirst({
    where: { id, userId },
  })
}

/**
 * Creates a new product, converting dollars to integer cents on boundary.
 */
export async function createProduct(userId: string, input: ProductCreateInput) {
  const { unitCostDollars, ...rest } = input
  return prisma.product.create({
    data: {
      ...rest,
      unitCost: dollarsToCents(unitCostDollars),
      userId,
    },
  })
}

/**
 * Updates a product, converting dollars to integer cents if updated.
 */
export async function updateProduct(id: string, userId: string, input: ProductUpdateInput) {
  const { unitCostDollars, ...rest } = input
  const data: Record<string, unknown> = { ...rest }

  if (unitCostDollars !== undefined) {
    data.unitCost = dollarsToCents(unitCostDollars)
  }

  return prisma.product.update({
    where: { id },
    data,
  })
}

/**
 * Deletes a product by ID.
 */
export async function deleteProduct(id: string) {
  return prisma.product.delete({
    where: { id },
  })
}

/**
 * Calculates overview metrics for the dashboard.
 */
export async function getOverviewStats(userId: string): Promise<OverviewStats> {
  const products = await getProducts(userId)

  // Total inventory value = sum(currentStock * unitCost)
  const totalInventoryValue = products.reduce((sum, p) => {
    return sum + p.currentStock * p.unitCost
  }, 0)

  // Low stock products using shared utility logic: isLowStock or isOutOfStock
  const lowStockCount = products.filter((p) =>
    isLowStock(p.currentStock, p.minStock) || isOutOfStock(p.currentStock)
  ).length

  // Pending approvals count for orders awaiting merchant signoff
  const pendingApprovals = await prisma.purchaseOrder.count({
    where: {
      userId,
      status: 'AWAITING_APPROVAL',
    },
  })

  return {
    totalInventoryValue,
    totalProducts: products.length,
    lowStockCount,
    monthlyProcurementSpend: 0,
    pendingApprovals,
    completedPurchases: 0,
  }
}

/**
 * Retrieves the latest agent activities across runs for the user.
 */
export async function getRecentActivities(userId: string, limit: number = 6) {
  return prisma.agentActivity.findMany({
    where: {
      procurementRun: {
        userId,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

/**
 * Gets or initializes the procurement policy for the demo user.
 */
export async function getPolicy(userId: string) {
  let policy = await prisma.procurementPolicy.findUnique({
    where: { userId },
  })

  if (!policy) {
    policy = await prisma.procurementPolicy.create({
      data: {
        userId,
        monthlyBudget: 200000,       // $2,000 in cents
        maxAutomaticPurchase: 10000, // $100 in cents
        requireApprovalAbove: 10000, // $100 in cents
        minimumProductRating: 4.0,
        allowAutomaticPurchases: false,
        currency: 'USD',
      },
    })
  }

  return policy
}

/**
 * Updates procurement policy, converting dollars to cents on boundary.
 */
export async function updatePolicy(userId: string, input: PolicyUpdateInput) {
  const {
    monthlyBudgetDollars,
    maxAutomaticPurchaseDollars,
    requireApprovalAboveDollars,
    ...rest
  } = input

  return prisma.procurementPolicy.upsert({
    where: { userId },
    update: {
      ...rest,
      monthlyBudget: dollarsToCents(monthlyBudgetDollars),
      maxAutomaticPurchase: dollarsToCents(maxAutomaticPurchaseDollars),
      requireApprovalAbove: dollarsToCents(requireApprovalAboveDollars),
    },
    create: {
      userId,
      ...rest,
      monthlyBudget: dollarsToCents(monthlyBudgetDollars),
      maxAutomaticPurchase: dollarsToCents(maxAutomaticPurchaseDollars),
      requireApprovalAbove: dollarsToCents(requireApprovalAboveDollars),
    },
  })
}

