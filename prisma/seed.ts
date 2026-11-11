import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding StockPilot database...')

  // 1. Create or update Demo User
  const user = await prisma.user.upsert({
    where: { email: 'demo@stockpilot.ai' },
    update: {
      name: 'Demo Store Owner',
    },
    create: {
      email: 'demo@stockpilot.ai',
      name: 'Demo Store Owner',
    },
  })

  console.log(`Demo User ID: ${user.id} (${user.email})`)

  // 2. Create or update Procurement Policy
  // Default policy: monthly budget $2,000 (200000 cents),
  // max automatic purchase $100 (10000 cents),
  // approval required above $100 (10000 cents),
  // minimum rating 4.0, automatic purchases off (false)
  const policy = await prisma.procurementPolicy.upsert({
    where: { userId: user.id },
    update: {
      monthlyBudget: 200000,
      maxAutomaticPurchase: 10000,
      requireApprovalAbove: 10000,
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

  console.log(`Procurement Policy configured: Budget $${policy.monthlyBudget / 100}`)

  // 3. Seed 12 realistic electronics retail products
  const seedProducts = [
    // Low stock items (stock < minStock)
    {
      name: 'Phone Charger (USB-C 20W PD)',
      sku: 'CHG-USBC-20W',
      category: 'Charging',
      currentStock: 12,
      minStock: 20,
      unitCost: 1499, // $14.99
    },
    {
      name: 'Wireless Mechanical Keyboard',
      sku: 'KB-MECH-RGB',
      category: 'Peripherals',
      currentStock: 8,
      minStock: 15,
      unitCost: 5999, // $59.99
    },
    {
      name: 'Ergonomic Wireless Mouse',
      sku: 'MOU-ERGO-WL',
      category: 'Peripherals',
      currentStock: 6,
      minStock: 18,
      unitCost: 2999, // $29.99
    },
    {
      name: 'MagSafe Wireless Charging Stand',
      sku: 'CHG-MAGSAFE-STD',
      category: 'Charging',
      currentStock: 0,
      minStock: 10,
      unitCost: 2499, // $24.99
    },
    {
      name: 'High-Speed 4K HDMI 2.1 Cable (2m)',
      sku: 'CBL-HDMI21-2M',
      category: 'Cables',
      currentStock: 5,
      minStock: 20,
      unitCost: 899, // $8.99
    },
    {
      name: 'Portable Power Bank 20,000mAh 65W',
      sku: 'PB-20K-65W',
      category: 'Charging',
      currentStock: 4,
      minStock: 15,
      unitCost: 4500, // $45.00
    },

    // Healthy stock items
    {
      name: 'Noise-Cancelling Bluetooth Headphones',
      sku: 'AUD-NC-BT01',
      category: 'Audio',
      currentStock: 45,
      minStock: 20,
      unitCost: 7999, // $79.99
    },
    {
      name: 'Braided USB-C to USB-A Cable (1m)',
      sku: 'CBL-USBA-C1M',
      category: 'Cables',
      currentStock: 60,
      minStock: 25,
      unitCost: 699, // $6.99
    },
    {
      name: 'Multiport USB-C Hub (7-in-1)',
      sku: 'HUB-USBC-7IN1',
      category: 'Accessories',
      currentStock: 24,
      minStock: 10,
      unitCost: 3499, // $34.99
    },
    {
      name: 'Ultra-Slim Laptop Sleeve 15-inch',
      sku: 'ACC-SLV-15GRY',
      category: 'Accessories',
      currentStock: 18,
      minStock: 12,
      unitCost: 1999, // $19.99
    },
    {
      name: 'Tempered Glass Screen Protector 2-Pack',
      sku: 'SCR-TG-UNIV',
      category: 'Protection',
      currentStock: 75,
      minStock: 30,
      unitCost: 499, // $4.99
    },
    {
      name: 'Bluetooth Conference Speakerphone',
      sku: 'AUD-SPK-CONF',
      category: 'Audio',
      currentStock: 14,
      minStock: 8,
      unitCost: 6999, // $69.99
    },
  ]

  for (const item of seedProducts) {
    await prisma.product.upsert({
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
  }

  console.log(`Seeded ${seedProducts.length} realistic products.`)
  console.log('Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

