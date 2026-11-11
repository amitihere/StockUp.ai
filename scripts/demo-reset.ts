import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function resetDemo() {
  console.log('🔄 Resetting StockPilot Demo State...')

  // 1. Fetch Demo User
  const user = await prisma.user.upsert({
    where: { email: 'demo@stockpilot.ai' },
    update: { name: 'Demo Store Owner' },
    create: {
      email: 'demo@stockpilot.ai',
      name: 'Demo Store Owner',
    },
  })

  // 2. Clear all transactional, agent, and receipt data
  console.log('Clearing past orders, payments, receipts, agent runs, and audit logs...')
  await prisma.auditLog.deleteMany({})
  await prisma.payment.deleteMany({})
  await prisma.approval.deleteMany({})
  await prisma.receiptLineItem.deleteMany({})
  await prisma.receipt.deleteMany({})
  await prisma.purchaseOrderItem.deleteMany({})
  await prisma.purchaseOrder.deleteMany({})
  await prisma.agentActivity.deleteMany({})
  await prisma.procurementRun.deleteMany({})
  await prisma.stockMovement.deleteMany({})

  // 3. Reset Procurement Policy to pristine defaults
  console.log('Resetting procurement policy...')
  await prisma.procurementPolicy.upsert({
    where: { userId: user.id },
    update: {
      monthlyBudget: 200000, // $2,000.00
      maxAutomaticPurchase: 10000, // $100.00
      requireApprovalAbove: 10000, // $100.00
      minimumProductRating: 4.0,
      allowAutomaticPurchases: false,
      currency: 'USD',
    },
    create: {
      userId: user.id,
      monthlyBudget: 200000,
      maxAutomaticPurchase: 10000,
      requireApprovalAbove: 10000,
      minimumProductRating: 4.0,
      allowAutomaticPurchases: false,
      currency: 'USD',
    },
  })

  // 4. Reset Product catalog and stock levels to seed state
  console.log('Restoring 12 baseline inventory products...')
  const initialProducts = [
    {
      name: 'Phone Charger (USB-C 20W PD)',
      sku: 'CHG-USBC-20W',
      category: 'Charging',
      currentStock: 12,
      minStock: 20,
      unitCost: 1499,
    },
    {
      name: 'Wireless Mechanical Keyboard',
      sku: 'KB-MECH-RGB',
      category: 'Peripherals',
      currentStock: 8,
      minStock: 15,
      unitCost: 5999,
    },
    {
      name: 'Ergonomic Wireless Mouse',
      sku: 'MOU-ERGO-WL',
      category: 'Peripherals',
      currentStock: 6,
      minStock: 18,
      unitCost: 2999,
    },
    {
      name: 'MagSafe Wireless Charging Stand',
      sku: 'CHG-MAGSAFE-STD',
      category: 'Charging',
      currentStock: 0,
      minStock: 10,
      unitCost: 2499,
    },
    {
      name: 'High-Speed 4K HDMI 2.1 Cable (2m)',
      sku: 'CBL-HDMI21-2M',
      category: 'Cables',
      currentStock: 5,
      minStock: 20,
      unitCost: 899,
    },
    {
      name: 'Portable Power Bank 20,000mAh 65W',
      sku: 'PB-20K-65W',
      category: 'Charging',
      currentStock: 4,
      minStock: 15,
      unitCost: 4500,
    },
    {
      name: 'Noise-Cancelling Bluetooth Headphones',
      sku: 'AUD-NC-BT01',
      category: 'Audio',
      currentStock: 45,
      minStock: 20,
      unitCost: 7999,
    },
    {
      name: 'Braided USB-C to USB-A Cable (1m)',
      sku: 'CBL-USBA-C1M',
      category: 'Cables',
      currentStock: 60,
      minStock: 25,
      unitCost: 699,
    },
    {
      name: 'Multiport USB-C Hub (7-in-1)',
      sku: 'HUB-USBC-7IN1',
      category: 'Accessories',
      currentStock: 24,
      minStock: 10,
      unitCost: 3499,
    },
    {
      name: 'Ultra-Slim Laptop Sleeve 15-inch',
      sku: 'ACC-SLV-15GRY',
      category: 'Accessories',
      currentStock: 18,
      minStock: 12,
      unitCost: 1999,
    },
    {
      name: 'Tempered Glass Screen Protector 2-Pack',
      sku: 'SCR-TG-UNIV',
      category: 'Protection',
      currentStock: 75,
      minStock: 30,
      unitCost: 499,
    },
    {
      name: 'Bluetooth Conference Speakerphone',
      sku: 'AUD-SPK-CONF',
      category: 'Audio',
      currentStock: 14,
      minStock: 8,
      unitCost: 6999,
    },
  ]

  const productMap = new Map<string, string>()

  for (const item of initialProducts) {
    const prod = await prisma.product.upsert({
      where: { sku: item.sku },
      update: {
        name: item.name,
        category: item.category,
        currentStock: item.currentStock,
        minStock: item.minStock,
        unitCost: item.unitCost,
        currency: 'USD',
      },
      create: {
        name: item.name,
        sku: item.sku,
        category: item.category,
        currentStock: item.currentStock,
        minStock: item.minStock,
        unitCost: item.unitCost,
        currency: 'USD',
        userId: user.id,
      },
    })
    productMap.set(item.sku, prod.id)
  }

  // 5. Seed historical StockMovements for realistic 30-day sales velocity data
  console.log('Seeding 30-day historical sales movements for velocity metrics...')
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000

  const historicalSales = [
    // Multiport USB-C Hub: steady velocity
    { sku: 'HUB-USBC-7IN1', change: -3, daysAgo: 2 },
    { sku: 'HUB-USBC-7IN1', change: -4, daysAgo: 6 },
    { sku: 'HUB-USBC-7IN1', change: -5, daysAgo: 12 },
    { sku: 'HUB-USBC-7IN1', change: -2, daysAgo: 18 },
    { sku: 'HUB-USBC-7IN1', change: -4, daysAgo: 25 },
    // Phone Charger (USB-C 20W PD): high velocity
    { sku: 'CHG-USBC-20W', change: -5, daysAgo: 1 },
    { sku: 'CHG-USBC-20W', change: -8, daysAgo: 4 },
    { sku: 'CHG-USBC-20W', change: -6, daysAgo: 9 },
    { sku: 'CHG-USBC-20W', change: -7, daysAgo: 15 },
    { sku: 'CHG-USBC-20W', change: -6, daysAgo: 22 },
    // Braided USB Cable: high velocity
    { sku: 'CBL-USBA-C1M', change: -10, daysAgo: 3 },
    { sku: 'CBL-USBA-C1M', change: -8, daysAgo: 8 },
    { sku: 'CBL-USBA-C1M', change: -12, daysAgo: 16 },
    { sku: 'CBL-USBA-C1M', change: -15, daysAgo: 24 },
    // Wireless Mechanical Keyboard: moderate velocity
    { sku: 'KB-MECH-RGB', change: -2, daysAgo: 5 },
    { sku: 'KB-MECH-RGB', change: -3, daysAgo: 11 },
    { sku: 'KB-MECH-RGB', change: -2, daysAgo: 20 },
    // Ergonomic Wireless Mouse: moderate velocity
    { sku: 'MOU-ERGO-WL', change: -3, daysAgo: 4 },
    { sku: 'MOU-ERGO-WL', change: -4, daysAgo: 10 },
    { sku: 'MOU-ERGO-WL', change: -3, daysAgo: 19 },
    // MagSafe Wireless Charging Stand: moderate velocity (now 0 stock)
    { sku: 'CHG-MAGSAFE-STD', change: -4, daysAgo: 2 },
    { sku: 'CHG-MAGSAFE-STD', change: -3, daysAgo: 7 },
    { sku: 'CHG-MAGSAFE-STD', change: -3, daysAgo: 14 },
    // Laptop Sleeve: steady velocity
    { sku: 'ACC-SLV-15GRY', change: -2, daysAgo: 3 },
    { sku: 'ACC-SLV-15GRY', change: -3, daysAgo: 8 },
    { sku: 'ACC-SLV-15GRY', change: -2, daysAgo: 17 },
  ]

  for (const move of historicalSales) {
    const prodId = productMap.get(move.sku)
    if (prodId) {
      await prisma.stockMovement.create({
        data: {
          productId: prodId,
          change: move.change,
          source: 'receipt',
          referenceId: `HIST-SALE-${Math.abs(move.daysAgo)}D`,
          createdAt: new Date(now - move.daysAgo * dayMs),
        },
      })
    }
  }

  console.log('✅ Demo state reset complete. Ready for demo recording!')
}

resetDemo()
  .catch((e) => {
    console.error('Reset error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
