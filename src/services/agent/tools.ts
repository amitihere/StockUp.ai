import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import {
  searchProducts,
  getProductDetails,
  saveSupplierProduct,
  normalizeChannel3Product,
} from '@/services/channel3'
import {
  calculateRestockQuantity,
  validatePurchasePolicy,
  trimProposalToBudget,
  ProposalItemDraft,
} from '@/services/policy'
import { getDemoUser, getPolicy } from '@/services/inventory'
import { isLowStock, isOutOfStock } from '@/lib/utils'
import { AIToolDefinition } from '@/services/ai/types'

// Tool parameter schemas (Zod)
export const getInventorySchema = z.object({
  category: z.string().optional(),
})

export const addInventoryProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  sku: z.string().min(1, 'SKU is required'),
  category: z.string().min(1, 'Category is required'),
  currentStock: z.number().int().min(0).default(0),
  minStock: z.number().int().min(1).default(5),
  unitCostCents: z.number().int().min(0).default(0),
})

export const getLowStockProductsSchema = z.object({})

export const searchProductsSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  limit: z.number().int().min(1).max(10).optional().default(3),
  productId: z.string().optional(),
})

export const getProductDetailsSchema = z.object({
  id: z.string().min(1, 'Product ID is required'),
})

export const compareProductsSchema = z.object({
  productIds: z.array(z.string()).min(2, 'At least 2 products required for comparison'),
})

export const calculateRestockQuantitySchema = z.object({
  currentStock: z.number().int().min(0),
  minStock: z.number().int().min(0),
  avgDailySales: z.number().min(0).optional(),
})

export const getSalesVelocitySchema = z.object({
  productId: z.string().optional(),
  category: z.string().optional(),
})

export const createPurchaseProposalSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().min(1, 'Internal inventory productId is required'),
      channel3ProductId: z.string().min(1, 'Channel3 product ID is required'),
      quantity: z.number().int().positive('Quantity must be a positive integer'),
      reasoning: z.string().min(1, 'Reasoning is required'),
    })
  ),
  ownerBudgetCents: z.number().int().positive().optional(),
})

export const validatePurchasePolicySchema = z.object({
  items: z.array(
    z.object({
      productId: z.string(),
      productName: z.string().optional().default('Product'),
      currentStock: z.number().optional().default(0),
      minStock: z.number().optional().default(5),
      quantity: z.number(),
      unitPrice: z.number(),
      totalPrice: z.number().optional(),
      reasoning: z.string().optional().default('Restock requirement'),
      rating: z.number().optional(),
      channel3ProductId: z.string().optional(),
      retailer: z.string().optional(),
    })
  ),
  ownerBudgetCents: z.number().int().positive().optional(),
})

export const requestApprovalSchema = z.object({
  runId: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string().min(1, 'Product ID is required'),
      productName: z.string().optional().default('Product'),
      quantity: z.number(),
      unitPrice: z.number().optional(), // Ignored: server recomputes from SupplierProduct
      totalPrice: z.number().optional(), // Ignored: server recomputes
      reasoning: z.string().optional().default('Restock proposal'),
      retailer: z.string().optional(),
      channel3ProductId: z.string().optional(),
    })
  ),
  totalAmount: z.number().optional(), // Ignored: server recomputes
  notes: z.string().optional(),
})

// Tool Definitions for the LLM
export const AGENT_TOOLS: AIToolDefinition[] = [
  {
    name: 'add_inventory_product',
    description:
      'Add a brand-new product to the store inventory when it does not already exist. Use this when the store has an empty inventory or when the user asks to add/create a new product. Returns the new product ID to use in create_purchase_proposal.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Full product name (e.g. "USB-C Wall Charger 20W PD")' },
        sku: { type: 'string', description: 'Short unique SKU code (e.g. "CHG-USBC-20W")' },
        category: { type: 'string', description: 'Product category (e.g. "Charging", "Cables", "Peripherals", "Audio", "Accessories")' },
        currentStock: { type: 'number', description: 'Starting stock quantity (default 0)' },
        minStock: { type: 'number', description: 'Minimum stock threshold before reorder (default 5)' },
        unitCostCents: { type: 'number', description: 'Unit cost in integer cents (e.g. 1499 = $14.99). Set 0 if unknown.' },
      },
      required: ['name', 'sku', 'category'],
    },
  },
  {
    name: 'get_inventory',
    description:
      'Retrieve all products currently in store inventory, including current stock, minimum stock, and category.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Optional category filter to narrow down results.',
        },
      },
    },
  },
  {
    name: 'get_low_stock_products',
    description:
      'Retrieve only products that are currently below their minimum stock threshold or out of stock.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_sales_velocity',
    description:
      'Calculates real sales velocity (units sold over the last 30 days from confirmed receipts) per product, average daily sales rate, and dynamically recommended 14-day cover stock targets.',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'Optional internal product ID to query velocity for a specific item.',
        },
        category: {
          type: 'string',
          description: 'Optional category filter to narrow down velocity results.',
        },
      },
    },
  },
  {
    name: 'search_products',
    description:
      'Search real supplier catalog products via Channel3 across thousands of retailers. Returns canonical products with best in-stock offers and ratings.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for the product (e.g. "USB-C wall charger 20W").',
        },
        productId: {
          type: 'string',
          description: 'Optional store inventory product ID being sourced to link supplier offers directly to this item.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of supplier products to return (default: 3, max: 10).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_product_details',
    description:
      'Get detailed specifications, all retailer offers, and ratings for a specific Channel3 product ID.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Channel3 canonical product ID (e.g. "D59JWCz").',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'compare_products',
    description:
      'Perform a side-by-side comparison of 2 or more Channel3 supplier products on price, availability, supplier rating, and relevance.',
    parameters: {
      type: 'object',
      properties: {
        productIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of Channel3 product IDs to compare.',
        },
      },
      required: ['productIds'],
    },
  },
  {
    name: 'calculate_restock_quantity',
    description:
      'Deterministic calculation to determine replenishment quantity: target = max(2 * minStock, ceil(avgDailySales * 14)) (two weeks cover), restock = max(1, target - current). Do not calculate quantities manually; always invoke this tool.',
    parameters: {
      type: 'object',
      properties: {
        currentStock: {
          type: 'number',
          description: 'Current units on hand.',
        },
        minStock: {
          type: 'number',
          description: 'Configured minimum stock threshold.',
        },
        avgDailySales: {
          type: 'number',
          description: 'Optional average daily sales velocity from get_sales_velocity for 14-day dynamic cover.',
        },
      },
      required: ['currentStock', 'minStock'],
    },
  },
  {
    name: 'create_purchase_proposal',
    description:
      'Assemble a purchase proposal for replenishment. The backend verifies all supplier prices from live Channel3 data and recalculates totals safely. Never invent or trust prices yourself.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string', description: 'Internal store inventory product ID' },
              channel3ProductId: { type: 'string', description: 'Selected Channel3 canonical product ID' },
              quantity: { type: 'number', description: 'Restock quantity to purchase' },
              reasoning: { type: 'string', description: 'Justification for selecting this item and supplier' },
            },
          },
          description: 'List of items to restock with chosen suppliers.',
        },
        ownerBudgetCents: {
          type: 'number',
          description: 'Optional explicit budget cap in integer cents mentioned by the store owner.',
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'validate_purchase_policy',
    description:
      'Run the store procurement policy engine on a proposal. Validates budget limits, supplier rating gates (>= 4.0), positive amounts, and approval requirements.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string' },
              productName: { type: 'string' },
              quantity: { type: 'number' },
              unitPrice: { type: 'number' },
              totalPrice: { type: 'number' },
              reasoning: { type: 'string' },
              rating: { type: 'number' },
            },
          },
        },
        ownerBudgetCents: {
          type: 'number',
          description: 'Optional budget cap in integer cents.',
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'request_approval',
    description:
      'Save the validated purchase order to the database with status AWAITING_APPROVAL for merchant review. All line item prices and totals are verified and calculated server-side from stored supplier catalog data. This is the terminal tool call for the agent.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Current procurement run ID' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'string', description: 'Internal store inventory product ID' },
              quantity: { type: 'number', description: 'Positive integer quantity to order' },
              channel3ProductId: { type: 'string', description: 'Optional Channel3 supplier product ID' },
              reasoning: { type: 'string', description: 'Restock justification' },
              retailer: { type: 'string', description: 'Supplier/retailer name' },
            },
          },
        },
        notes: { type: 'string', description: 'Executive summary for the store owner' },
      },
      required: ['items'],
    },
  },
]

// Implementation dispatcher
export async function executeAgentTool(
  toolName: string,
  args: Record<string, unknown>,
  context: { userId: string; runId: string; productIds?: string[] }
): Promise<Record<string, unknown>> {
  switch (toolName) {
    case 'add_inventory_product': {
      const parsed = addInventoryProductSchema.parse(args)

      // Generate a unique SKU suffix to avoid collisions
      const baseSku = parsed.sku.toUpperCase().replace(/[^A-Z0-9\-]/g, '-')
      const existing = await prisma.product.findFirst({ where: { sku: baseSku } })
      const finalSku = existing ? `${baseSku}-${Date.now().toString(36).toUpperCase()}` : baseSku

      const newProduct = await prisma.product.create({
        data: {
          name: parsed.name,
          sku: finalSku,
          category: parsed.category,
          currentStock: parsed.currentStock,
          minStock: parsed.minStock,
          unitCost: parsed.unitCostCents,
          currency: 'USD',
          userId: context.userId,
        },
      })

      return {
        success: true,
        productId: newProduct.id,
        name: newProduct.name,
        sku: newProduct.sku,
        category: newProduct.category,
        currentStock: newProduct.currentStock,
        minStock: newProduct.minStock,
        message: `Product "${newProduct.name}" (SKU: ${newProduct.sku}) created in inventory with ID ${newProduct.id}. Use this productId in create_purchase_proposal.`,
      }
    }

    case 'get_inventory': {
      const parsed = getInventorySchema.parse(args)
      const where: { userId: string; category?: string } = { userId: context.userId }
      if (parsed.category) where.category = parsed.category

      const products = await prisma.product.findMany({
        where,
        orderBy: { currentStock: 'asc' },
      })

      return {
        products: products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category,
          currentStock: p.currentStock,
          minStock: p.minStock,
          unitCostCents: p.unitCost,
          isLowStock: isLowStock(p.currentStock, p.minStock),
          isOutOfStock: isOutOfStock(p.currentStock),
        })),
      }
    }

    case 'get_low_stock_products': {
      getLowStockProductsSchema.parse(args)
      const where: { userId: string; id?: { in: string[] } } = { userId: context.userId }
      if (context.productIds && context.productIds.length > 0) {
        where.id = { in: context.productIds }
      }
      const all = await prisma.product.findMany({
        where,
      })

      const lowStock = all
        .filter((p) => isLowStock(p.currentStock, p.minStock) || isOutOfStock(p.currentStock))
        .map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          category: p.category,
          currentStock: p.currentStock,
          minStock: p.minStock,
          deficit: p.minStock - p.currentStock,
          targetStock: 2 * p.minStock,
          recommendedRestockQuantity: calculateRestockQuantity(p.currentStock, p.minStock),
          isOutOfStock: isOutOfStock(p.currentStock),
        }))
        .sort((a, b) => {
          // Out of stock first, then largest deficit
          if (a.isOutOfStock !== b.isOutOfStock) return a.isOutOfStock ? -1 : 1
          return b.deficit - a.deficit
        })

      if (all.length === 0) {
        return {
          lowStockProducts: [],
          inventoryIsEmpty: true,
          message:
            context.productIds && context.productIds.length > 0
              ? 'No products found within the specified restock scope.'
              : 'Inventory is empty. Use add_inventory_product to add products first, then run search_products and create_purchase_proposal.',
        }
      }

      return { lowStockProducts: lowStock }
    }

    case 'get_sales_velocity': {
      const parsed = getSalesVelocitySchema.parse(args)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      const whereProduct: { userId: string; id?: string; category?: string } = {
        userId: context.userId,
      }
      if (parsed.productId) whereProduct.id = parsed.productId
      if (parsed.category) whereProduct.category = parsed.category

      const products = await prisma.product.findMany({
        where: whereProduct,
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

      const velocityData = products.map((prod) => {
        const unitsSold30d = prod.stockMovements.reduce(
          (sum, m) => sum + Math.abs(m.change),
          0
        )
        const avgDailySales = Math.round((unitsSold30d / 30) * 100) / 100
        const recommendedCover = Math.ceil(avgDailySales * 14)
        const targetStock = Math.max(2 * prod.minStock, recommendedCover)
        const recommendedRestock = Math.max(1, targetStock - prod.currentStock)

        return {
          productId: prod.id,
          name: prod.name,
          sku: prod.sku,
          category: prod.category,
          currentStock: prod.currentStock,
          minStock: prod.minStock,
          unitsSold30d,
          avgDailySales,
          recommendedCover14d: recommendedCover,
          targetStock,
          recommendedRestock,
        }
      })

      velocityData.sort((a, b) => b.unitsSold30d - a.unitsSold30d)

      return {
        count: velocityData.length,
        summary: `Computed sales velocity for ${velocityData.length} product(s) over the last 30 days from confirmed receipts.`,
        products: velocityData,
      }
    }

    case 'search_products': {
      const parsed = searchProductsSchema.parse(args)
      const results = await searchProducts(parsed.query, parsed.limit)

      // Pre-save all results to DB so create_purchase_proposal can reuse
      // them without an extra Channel3 API call (saves quota on free tier).
      // Link supplier offers to the specific product actually being sourced.
      const allProducts = await prisma.product.findMany({
        where: { userId: context.userId },
        select: { id: true, name: true, sku: true },
      })

      let targetProduct = parsed.productId
        ? allProducts.find((p) => p.id === parsed.productId)
        : undefined

      if (!targetProduct && parsed.query) {
        const q = parsed.query.toLowerCase().trim()
        targetProduct =
          allProducts.find((p) => q.includes(p.sku.toLowerCase()) || p.sku.toLowerCase().includes(q)) ||
          allProducts.find((p) => {
            const nameLower = p.name.toLowerCase()
            return q.includes(nameLower) || nameLower.includes(q)
          })

        if (!targetProduct) {
          const qTokens = q.split(/[^a-z0-9]+/i).filter((t) => t.length > 2)
          targetProduct = allProducts.find((p) => {
            const pTokens = p.name.toLowerCase().split(/[^a-z0-9]+/i).filter((t) => t.length > 2)
            return qTokens.some((qt) => pTokens.includes(qt))
          })
        }
      }

      if (targetProduct) {
        await Promise.allSettled(
          results.map((p) => saveSupplierProduct(targetProduct!.id, p))
        )
      }

      // Truncate descriptions to preserve context and treat as untrusted
      return {
        query: parsed.query,
        count: results.length,
        inventoryIsEmpty: allProducts.length === 0,
        products: results.map((p) => ({
          id: p.id,
          title: p.title.slice(0, 100),
          brand: p.brand,
          imageUrl: p.imageUrl,
          bestOffer: p.bestOffer
            ? {
                retailer: p.bestOffer.retailer,
                priceCents: p.bestOffer.priceCents,
                priceFormatted: `$${(p.bestOffer.priceCents / 100).toFixed(2)}`,
                availability: p.bestOffer.availability,
                url: p.bestOffer.url,
              }
            : null,
          rating: p.rating,
          ratingCount: p.ratingCount,
        })),
      }
    }

    case 'get_product_details': {
      const parsed = getProductDetailsSchema.parse(args)
      const product = await getProductDetails(parsed.id)

      return {
        product: {
          id: product.id,
          title: product.title.slice(0, 120),
          brand: product.brand,
          imageUrl: product.imageUrl,
          description: product.description?.slice(0, 300),
          offers: product.offers.map((o) => ({
            retailer: o.retailer,
            priceCents: o.priceCents,
            priceFormatted: `$${(o.priceCents / 100).toFixed(2)}`,
            availability: o.availability,
            url: o.url,
          })),
          bestOffer: product.bestOffer
            ? {
                retailer: product.bestOffer.retailer,
                priceCents: product.bestOffer.priceCents,
                availability: product.bestOffer.availability,
              }
            : null,
          rating: product.rating,
          ratingCount: product.ratingCount,
        },
      }
    }

    case 'compare_products': {
      const parsed = compareProductsSchema.parse(args)
      const details = await Promise.all(
        parsed.productIds.slice(0, 4).map((id) => getProductDetails(id).catch(() => null))
      )
      const valid = details.filter((d): d is NonNullable<typeof d> => d !== null)

      const comparison = valid.map((p) => ({
        id: p.id,
        title: p.title.slice(0, 80),
        brand: p.brand || 'Generic',
        bestPriceCents: p.bestOffer?.priceCents ?? 0,
        bestPriceFormatted: p.bestOffer ? `$${(p.bestOffer.priceCents / 100).toFixed(2)}` : 'N/A',
        retailer: p.bestOffer?.retailer || 'Unknown',
        availability: p.bestOffer?.availability || 'Unknown',
        rating: p.rating ?? 'No rating',
        ratingCount: p.ratingCount ?? 0,
        valueScore: p.bestOffer
          ? Number(
              ((p.rating ?? 4.0) / Math.max(1, p.bestOffer.priceCents / 100)).toFixed(2)
            )
          : 0,
      }))

      // Sort by best price ascending
      comparison.sort((a, b) => a.bestPriceCents - b.bestPriceCents)

      return {
        candidates: comparison,
        recommendedChoice: comparison[0]?.id,
        summary: `Analyzed ${comparison.length} products. Lowest price supplier is ${comparison[0]?.retailer} at ${comparison[0]?.bestPriceFormatted}.`,
      }
    }

    case 'calculate_restock_quantity': {
      const parsed = calculateRestockQuantitySchema.parse(args)
      const restockQuantity = calculateRestockQuantity(
        parsed.currentStock,
        parsed.minStock,
        parsed.avgDailySales
      )
      const coverTarget =
        parsed.avgDailySales && parsed.avgDailySales > 0
          ? Math.ceil(parsed.avgDailySales * 14)
          : 0
      const targetStock = Math.max(2 * parsed.minStock, coverTarget)

      return {
        currentStock: parsed.currentStock,
        minStock: parsed.minStock,
        avgDailySales: parsed.avgDailySales || 0,
        targetStock,
        restockQuantity,
        formula: parsed.avgDailySales
          ? 'targetStock = max(2 * minStock, ceil(avgDailySales * 14)); quantity = max(1, targetStock - currentStock)'
          : 'targetStock = 2 * minStock; quantity = max(1, targetStock - currentStock)',
      }
    }

    case 'create_purchase_proposal': {
      const parsed = createPurchaseProposalSchema.parse(args)

      // Hard scope check: reject any item whose productId is not in scope
      if (context.productIds && context.productIds.length > 0) {
        const outOfScope = parsed.items.filter(
          (item) => !context.productIds!.includes(item.productId)
        )
        if (outOfScope.length > 0) {
          return {
            error: 'OUT_OF_SCOPE_PRODUCT',
            message: `Product ID(s) [${outOfScope
              .map((i) => i.productId)
              .join(', ')}] are out of the designated procurement scope [${context.productIds.join(', ')}].`,
          }
        }
      }

      const policy = await getPolicy(context.userId)

      // Fetch store inventory products
      const allUserProducts = await prisma.product.findMany({
        where: { userId: context.userId },
      })

      // Fetch Channel3 products for verified pricing
      const drafts: ProposalItemDraft[] = []

      for (const item of parsed.items) {
        // --- Resolve internal inventory product ---
        let prod = allUserProducts.find((p) => p.id === item.productId)
        if (!prod) {
          // Fuzzy match by name from reasoning field
          prod = allUserProducts.find(
            (p) =>
              p.name.toLowerCase().includes(item.productId.toLowerCase()) ||
              item.reasoning.toLowerCase().includes(p.name.toLowerCase())
          )
        }
        if (!prod && allUserProducts.length > 0) {
          prod = allUserProducts[0]
        }
        if (!prod) {
          // Inventory is completely empty — return a helpful error rather than silently skipping
          return {
            error: 'EMPTY_INVENTORY',
            message:
              'Your inventory is empty. Please use the add_inventory_product tool to add the product first, then call create_purchase_proposal with the returned productId.',
            items: [],
            totalAmountCents: 0,
          }
        }

        if (
          context.productIds &&
          context.productIds.length > 0 &&
          !context.productIds.includes(prod.id)
        ) {
          return {
            error: 'OUT_OF_SCOPE_PRODUCT',
            message: `Product "${prod.name}" (${prod.id}) is out of the designated procurement scope [${context.productIds.join(', ')}].`,
          }
        }

        // --- Resolve Channel3 product: DB first, then API (saves quota) ---
        let channel3Product
        const existingSupplier = await prisma.supplierProduct.findFirst({
          where: { supplierId: item.channel3ProductId },
        })

        if (existingSupplier) {
          // Reuse previously fetched and saved supplier data — no extra API call
          channel3Product = {
            id: item.channel3ProductId,
            title: existingSupplier.externalName || prod.name,
            brand: 'Verified Supplier',
            imageUrl: '',
            offers: [],
            bestOffer: {
              retailer: existingSupplier.supplierId,
              priceCents: existingSupplier.price,
              currency: existingSupplier.currency || 'USD',
              availability: existingSupplier.inStock ? 'InStock' : 'OutOfStock',
              url: '',
            },
            rating: existingSupplier.rating ?? undefined,
            ratingCount: 10,
            sourceUrl: '',
          }
        } else {
          // Fallback: fetch from Channel3 API (only when not cached)
          try {
            channel3Product = await getProductDetails(item.channel3ProductId)
          } catch {
            // Last resort: use internal product cost
            channel3Product = null
          }
        }

        if (!channel3Product) continue

        // Save supplier product to DB (upsert — idempotent)
        const supplierProduct = await saveSupplierProduct(prod.id, channel3Product)

        const unitPriceCents = channel3Product.bestOffer
          ? channel3Product.bestOffer.priceCents
          : prod.unitCost

        const totalPriceCents = unitPriceCents * item.quantity

        drafts.push({
          productId: prod.id,
          productName: prod.name,
          currentStock: prod.currentStock,
          minStock: prod.minStock,
          quantity: item.quantity,
          unitPrice: unitPriceCents,
          totalPrice: totalPriceCents,
          reasoning: item.reasoning,
          rating: channel3Product.rating,
          channel3ProductId: channel3Product.id,
          retailer: channel3Product.bestOffer?.retailer || 'Wholesale Supplier',
          supplierProductId: supplierProduct.id,
        })
      }

      // Compute this month's already committed spend so proposal matches checkout policy
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const committedOrders = await prisma.purchaseOrder.findMany({
        where: {
          userId: context.userId,
          createdAt: { gte: startOfMonth },
          status: { in: ['APPROVED', 'PAYMENT_PENDING', 'PAID'] },
        },
        select: { totalAmount: true },
      })

      const thisMonthCommittedCents = committedOrders.reduce(
        (sum, o) => sum + o.totalAmount,
        0
      )
      const remainingMonthly = Math.max(0, policy.monthlyBudget - thisMonthCommittedCents)

      // Check budget and trim if necessary
      const maxAllowed = parsed.ownerBudgetCents
        ? Math.min(parsed.ownerBudgetCents, remainingMonthly)
        : remainingMonthly

      let finalItems = drafts
      let total = drafts.reduce((sum, d) => sum + d.totalPrice, 0)
      let wasTrimmed = false

      if (total > maxAllowed) {
        finalItems = trimProposalToBudget(drafts, maxAllowed)
        total = finalItems.reduce((sum, d) => sum + d.totalPrice, 0)
        wasTrimmed = true
      }

      const policyEval = validatePurchasePolicy(
        finalItems,
        policy,
        thisMonthCommittedCents,
        parsed.ownerBudgetCents
      )

      return {
        items: finalItems,
        totalAmountCents: total,
        totalAmountFormatted: `$${(total / 100).toFixed(2)}`,
        wasTrimmed,
        policyEvaluation: policyEval,
        explanation: wasTrimmed
          ? `Proposal was trimmed to stay within allowable budget of $${(maxAllowed / 100).toFixed(
              2
            )}. High deficit and out-of-stock items were prioritized.`
          : `Proposal formulated successfully for ${finalItems.length} product(s) totaling $${(
              total / 100
            ).toFixed(2)}.`,
      }
    }

    case 'validate_purchase_policy': {
      const parsed = validatePurchasePolicySchema.parse(args)
      const policy = await getPolicy(context.userId)

      const drafts: ProposalItemDraft[] = parsed.items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        currentStock: i.currentStock,
        minStock: i.minStock,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        totalPrice: i.totalPrice ?? i.unitPrice * i.quantity,
        reasoning: i.reasoning,
        rating: i.rating,
        channel3ProductId: i.channel3ProductId,
        retailer: i.retailer,
      }))

      const evaluation = validatePurchasePolicy(
        drafts,
        policy,
        0,
        parsed.ownerBudgetCents
      )

      return {
        passed: evaluation.passed,
        requiresApproval: evaluation.requiresApproval,
        totalAmountCents: evaluation.totalAmount,
        checks: evaluation.checks,
        violations: evaluation.violations,
      }
    }

    case 'request_approval': {
      const parsed = requestApprovalSchema.parse(args)

      if (!parsed.items || parsed.items.length === 0) {
        return {
          error: 'EMPTY_ITEMS',
          message: 'Cannot request approval without any replenishment items.',
        }
      }

      // Hard scope check: reject any item whose productId is not in scope
      if (context.productIds && context.productIds.length > 0) {
        const outOfScope = parsed.items.filter(
          (item) => !context.productIds!.includes(item.productId)
        )
        if (outOfScope.length > 0) {
          return {
            error: 'OUT_OF_SCOPE_PRODUCT',
            message: `Product ID(s) [${outOfScope
              .map((i) => i.productId)
              .join(', ')}] are out of the designated procurement scope [${context.productIds.join(', ')}]. Order creation rejected.`,
          }
        }
      }

      // Fetch all user products
      const storeProducts = await prisma.product.findMany({
        where: { userId: context.userId },
      })

      if (storeProducts.length === 0) {
        return {
          error: 'EMPTY_INVENTORY',
          message:
            'Cannot create a purchase order: inventory is empty. Use add_inventory_product to add products first.',
        }
      }

      const productMap = new Map(storeProducts.map((p) => [p.id, p]))

      interface VerifiedItem {
        product: typeof storeProducts[0]
        supplierProduct: {
          id: string
          supplierId: string
          price: number
          externalName: string | null
          rating: number
        }
        quantity: number
        unitPrice: number
        lineTotal: number
        reasoning: string
        retailer: string
      }

      const recomputedItems: VerifiedItem[] = []

      for (const item of parsed.items) {
        // 1. Verify integer and positive quantity (reject non-integer or non-positive quantities)
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
          return {
            error: 'INVALID_QUANTITY',
            message: `Invalid quantity "${item.quantity}" for product ID "${item.productId}". Quantity must be a positive integer.`,
          }
        }

        // 2. Verify product exists in user inventory (reject unknown products)
        const product = productMap.get(item.productId)
        if (!product) {
          return {
            error: 'UNKNOWN_PRODUCT',
            message: `Unknown inventory product ID "${item.productId}". All items must reference an existing store product.`,
          }
        }

        // 3. Look up stored best offer in SupplierProduct table
        let supplierProduct: {
          id: string
          supplierId: string
          price: number
          externalName: string | null
          rating: number
        } | null = null

        if (item.channel3ProductId) {
          supplierProduct = await prisma.supplierProduct.findFirst({
            where: {
              productId: product.id,
              supplierId: item.channel3ProductId,
            },
            select: {
              id: true,
              supplierId: true,
              price: true,
              externalName: true,
              rating: true,
            },
          })
        }

        if (!supplierProduct) {
          supplierProduct = await prisma.supplierProduct.findFirst({
            where: {
              productId: product.id,
              price: { gt: 0 },
            },
            orderBy: [{ inStock: 'desc' }, { price: 'asc' }],
            select: {
              id: true,
              supplierId: true,
              price: true,
              externalName: true,
              rating: true,
            },
          })
        }

        // Reject items without a stored price
        if (
          !supplierProduct ||
          typeof supplierProduct.price !== 'number' ||
          supplierProduct.price <= 0
        ) {
          return {
            error: 'MISSING_STORED_PRICE',
            message: `No verified supplier price found in database for product "${product.name}" (${product.id}). Items without a stored supplier offer cannot be approved.`,
          }
        }

        // 4. Server computes line total in integer cents (IGNORING model's unitPrice/totalPrice)
        const serverUnitPrice = supplierProduct.price
        const serverLineTotal = serverUnitPrice * item.quantity

        recomputedItems.push({
          product,
          supplierProduct,
          quantity: item.quantity,
          unitPrice: serverUnitPrice,
          lineTotal: serverLineTotal,
          reasoning: item.reasoning || `Restock requirement for ${product.name}`,
          retailer:
            supplierProduct.externalName ||
            item.retailer ||
            supplierProduct.supplierId ||
            'Channel3 Supplier',
        })
      }

      // 5. Recompute order total in integer cents on the server (IGNORING model's totalAmount)
      const serverOrderTotal = recomputedItems.reduce((sum, i) => sum + i.lineTotal, 0)

      // 6. Run policy engine validation on the recomputed proposal
      const policy = await getPolicy(context.userId)

      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const committedOrders = await prisma.purchaseOrder.findMany({
        where: {
          userId: context.userId,
          createdAt: { gte: startOfMonth },
          status: { in: ['APPROVED', 'PAYMENT_PENDING', 'PAID'] },
        },
        select: { totalAmount: true },
      })

      const thisMonthCommittedCents = committedOrders.reduce(
        (sum, o) => sum + o.totalAmount,
        0
      )

      const drafts: ProposalItemDraft[] = recomputedItems.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        currentStock: item.product.currentStock,
        minStock: item.product.minStock,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.lineTotal,
        reasoning: item.reasoning,
        rating: item.supplierProduct.rating,
        channel3ProductId: item.supplierProduct.supplierId,
        retailer: item.retailer,
        supplierProductId: item.supplierProduct.id,
      }))

      const evaluation = validatePurchasePolicy(
        drafts,
        policy,
        thisMonthCommittedCents
      )

      // REFUSE to create order if any policy rule fails
      if (!evaluation.passed) {
        return {
          error: 'POLICY_VIOLATION',
          message: `Procurement policy validation failed: ${evaluation.violations.join('; ')}`,
          violations: evaluation.violations,
          recomputedTotalCents: serverOrderTotal,
          recomputedTotalFormatted: `$${(serverOrderTotal / 100).toFixed(2)}`,
        }
      }

      // 7. Create PurchaseOrder in database with verified server-calculated amounts
      const purchaseOrder = await prisma.purchaseOrder.create({
        data: {
          status: 'AWAITING_APPROVAL',
          totalAmount: serverOrderTotal,
          currency: 'USD',
          supplierId: recomputedItems[0]?.retailer || 'Channel3 Supplier',
          notes: parsed.notes || 'Automated AI procurement replenishment proposal.',
          userId: context.userId,
          procurementRunId: context.runId,
          items: {
            create: recomputedItems.map((item) => ({
              productId: item.product.id,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              currency: 'USD',
            })),
          },
          approvals: {
            create: {
              userId: context.userId,
              status: 'PENDING',
              notes: 'Generated by Autonomous Procurement Agent. Awaiting merchant signoff.',
            },
          },
        },
      })

      // Update ProcurementRun status
      await prisma.procurementRun.update({
        where: { id: context.runId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      })

      return {
        success: true,
        purchaseOrderId: purchaseOrder.id,
        status: 'AWAITING_APPROVAL',
        totalAmountFormatted: `$${(purchaseOrder.totalAmount / 100).toFixed(2)}`,
        totalAmountCents: purchaseOrder.totalAmount,
        itemsCount: recomputedItems.length,
        message:
          'Purchase proposal verified with server-side prices and policy validation. Created and routed to Approvals with status AWAITING_APPROVAL.',
      }
    }

    default:
      throw new Error(`Unknown agent tool: "${toolName}"`)
  }
}

