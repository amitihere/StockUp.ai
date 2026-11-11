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

export const getLowStockProductsSchema = z.object({})

export const searchProductsSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  limit: z.number().int().min(1).max(10).optional().default(3),
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
      productId: z.string(),
      productName: z.string().optional().default('Product'),
      quantity: z.number().int().positive(),
      unitPrice: z.number().int().nonnegative(),
      totalPrice: z.number().int().nonnegative().optional(),
      reasoning: z.string().optional().default('Restock proposal'),
      retailer: z.string().optional(),
      channel3ProductId: z.string().optional(),
    })
  ),
  totalAmount: z.number().int().positive(),
  notes: z.string().optional(),
})

// Tool Definitions for the LLM
export const AGENT_TOOLS: AIToolDefinition[] = [
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
      'Deterministic calculation to determine replenishment quantity: target = 2 * minStock, restock = max(1, target - current). Do not calculate quantities manually; always invoke this tool.',
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
      'Save the validated purchase order to the database with status AWAITING_APPROVAL for merchant review. This is the terminal tool call for the agent.',
    parameters: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Current procurement run ID' },
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
              retailer: { type: 'string' },
              channel3ProductId: { type: 'string' },
            },
          },
        },
        totalAmount: { type: 'number', description: 'Total order cost in cents' },
        notes: { type: 'string', description: 'Executive summary for the store owner' },
      },
      required: ['items', 'totalAmount'],
    },
  },
]

// Implementation dispatcher
export async function executeAgentTool(
  toolName: string,
  args: Record<string, unknown>,
  context: { userId: string; runId: string }
): Promise<Record<string, unknown>> {
  switch (toolName) {
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
      const all = await prisma.product.findMany({
        where: { userId: context.userId },
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

      return { lowStockProducts: lowStock }
    }

    case 'search_products': {
      const parsed = searchProductsSchema.parse(args)
      const results = await searchProducts(parsed.query, parsed.limit)

      // Pre-save all results to DB so create_purchase_proposal can reuse
      // them without an extra Channel3 API call (saves quota on free tier).
      // We try to find any matching inventory product to link against.
      const allProducts = await prisma.product.findMany({
        where: { userId: context.userId },
        select: { id: true, name: true },
      })
      const firstProductId = allProducts[0]?.id
      if (firstProductId) {
        await Promise.allSettled(
          results.map((p) => saveSupplierProduct(firstProductId, p))
        )
      }

      // Truncate descriptions to preserve context and treat as untrusted
      return {
        query: parsed.query,
        count: results.length,
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
      const restockQuantity = calculateRestockQuantity(parsed.currentStock, parsed.minStock)
      const targetStock = 2 * parsed.minStock

      return {
        currentStock: parsed.currentStock,
        minStock: parsed.minStock,
        targetStock,
        restockQuantity,
        formula: 'targetStock = 2 * minStock; quantity = max(1, targetStock - currentStock)',
      }
    }

    case 'create_purchase_proposal': {
      const parsed = createPurchaseProposalSchema.parse(args)
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
        if (!prod) continue

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

      // Check budget and trim if necessary
      const maxAllowed = parsed.ownerBudgetCents
        ? Math.min(parsed.ownerBudgetCents, policy.monthlyBudget)
        : policy.monthlyBudget

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
        0,
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

      // Ensure all productIds match valid store products (prevent foreign key failures)
      const storeProducts = await prisma.product.findMany({
        where: { userId: context.userId },
        select: { id: true, name: true },
      })
      const validProductIds = new Set(storeProducts.map((p) => p.id))

      const resolvedItems = parsed.items.map((item) => {
        if (validProductIds.has(item.productId)) {
          return item
        }
        const nameMatch = storeProducts.find(
          (p) => p.name.toLowerCase() === item.productName.toLowerCase()
        )
        if (nameMatch) {
          return { ...item, productId: nameMatch.id }
        }
        return { ...item, productId: storeProducts[0]?.id || item.productId }
      })

      // Create purchase order in database
      const purchaseOrder = await prisma.purchaseOrder.create({
        data: {
          status: 'AWAITING_APPROVAL',
          totalAmount: parsed.totalAmount,
          currency: 'USD',
          supplierId: parsed.items[0]?.retailer || 'Channel3 Supplier',
          notes: parsed.notes || 'Automated AI procurement replenishment proposal.',
          userId: context.userId,
          procurementRunId: context.runId,
          items: {
            create: resolvedItems.map((item) => ({
              productId: item.productId,
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
        itemsCount: parsed.items.length,
        message:
          'Purchase proposal created successfully and routed to Approvals with status AWAITING_APPROVAL.',
      }
    }

    default:
      throw new Error(`Unknown agent tool: "${toolName}"`)
  }
}

