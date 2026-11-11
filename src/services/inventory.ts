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

  // Start of current calendar month for procurement spend calculations
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  // Real monthly procurement spend (APPROVED, PAYMENT_PENDING, PAID orders this month)
  const monthlyOrders = await prisma.purchaseOrder.findMany({
    where: {
      userId,
      createdAt: { gte: startOfMonth },
      status: { in: ['APPROVED', 'PAYMENT_PENDING', 'PAID'] },
    },
    select: { totalAmount: true },
  })

  const monthlyProcurementSpend = monthlyOrders.reduce(
    (sum, o) => sum + o.totalAmount,
    0
  )

  // Real completed purchases count (PAID orders)
  const completedPurchases = await prisma.purchaseOrder.count({
    where: {
      userId,
      status: 'PAID',
    },
  })

  return {
    totalInventoryValue,
    totalProducts: products.length,
    lowStockCount,
    monthlyProcurementSpend,
    pendingApprovals,
    completedPurchases,
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

export interface ProductVelocityStat {
  productId: string
  name: string
  sku: string
  category: string
  currentStock: number
  minStock: number
  unitsSold30d: number
  avgDailySales: number
  recommendedCover14d: number
}

/**
 * Computes top-selling products over the last 30 days based on confirmed receipts.
 */
export async function getSalesVelocityStats(
  userId: string,
  limit: number = 5
): Promise<ProductVelocityStat[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const products = await prisma.product.findMany({
    where: { userId },
    include: {
      stockMovements: {
        where: {
          source: 'receipt',
          change: { lt: 0 },
          createdAt: { gte: thirtyDaysAgo },
        },
      },
    },
  })

  const results: ProductVelocityStat[] = products.map((p) => {
    const unitsSold30d = p.stockMovements.reduce(
      (sum, m) => sum + Math.abs(m.change),
      0
    )
    const avgDailySales = Math.round((unitsSold30d / 30) * 100) / 100
    const recommendedCover14d = Math.ceil(avgDailySales * 14)

    return {
      productId: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      currentStock: p.currentStock,
      minStock: p.minStock,
      unitsSold30d,
      avgDailySales,
      recommendedCover14d,
    }
  })

  // Sort descending by units sold
  results.sort((a, b) => b.unitsSold30d - a.unitsSold30d)
  return results.slice(0, limit)
}

