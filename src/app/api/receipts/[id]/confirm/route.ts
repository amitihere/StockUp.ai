import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDemoUser } from '@/services/inventory'
import { isLowStock, isOutOfStock } from '@/lib/utils'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const confirmLineSchema = z.object({
  id: z.string().optional(),
  rawName: z.string().trim().min(1, 'Item name is required'),
  sku: z.string().trim().nullable().optional(),
  matchedProductId: z.string().nullable().optional(),
  quantity: z.coerce.number().int().positive('Quantity must be a positive integer'),
  unitPrice: z.coerce.number().int().nonnegative(),
  discount: z.coerce.number().int().nonnegative().optional().default(0),
  lineTotal: z.coerce.number().int().nonnegative(),
})

const confirmReceiptSchema = z.object({
  merchant: z.string().trim().optional(),
  date: z.string().trim().optional(),
  totalCents: z.coerce.number().int().nonnegative().optional(),
  lines: z.array(confirmLineSchema).min(1, 'At least one line item is required'),
})

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getDemoUser()
    const receiptId = params.id
    const body = await request.json().catch(() => ({}))
    const parsed = confirmReceiptSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid confirmation payload', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { merchant, date, totalCents, lines } = parsed.data

    // Check receipt existence
    const receipt = await prisma.receipt.findFirst({
      where: {
        id: receiptId,
        userId: user.id,
      },
      include: {
        lineItems: true,
      },
    })

    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    if (receipt.status === 'CONFIRMED') {
      return NextResponse.json(
        { error: 'This receipt has already been confirmed and processed.' },
        { status: 400 }
      )
    }

    // Execute confirmation inside ONE atomic Prisma transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Delete old line items and insert confirmed lines
      await tx.receiptLineItem.deleteMany({
        where: { receiptId: receipt.id },
      })

      const createdLines = []
      for (const line of lines) {
        const item = await tx.receiptLineItem.create({
          data: {
            receiptId: receipt.id,
            rawName: line.rawName,
            sku: line.sku || null,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discount: line.discount || 0,
            lineTotal: line.lineTotal,
            matchedProductId: line.matchedProductId || null,
            currency: receipt.currency,
          },
        })
        createdLines.push(item)
      }

      // 2. Process stock deductions for matched products
      const clampedProducts: Array<{ productId: string; requestedDeduction: number; clampedStock: number }> = []

      for (const line of lines) {
        if (!line.matchedProductId) continue

        const product = await tx.product.findUnique({
          where: { id: line.matchedProductId },
        })

        if (!product) continue

        // Clamp at 0 (never negative)
        const newStock = Math.max(0, product.currentStock - line.quantity)
        const isClamped = product.currentStock - line.quantity < 0

        if (isClamped) {
          clampedProducts.push({
            productId: product.id,
            requestedDeduction: line.quantity,
            clampedStock: 0,
          })
        }

        // Decrement product current stock
        await tx.product.update({
          where: { id: product.id },
          data: { currentStock: newStock },
        })

        // Create StockMovement record with negative quantity for sale deduction
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            change: -line.quantity,
            source: 'receipt',
            referenceId: receipt.id,
          },
        })
      }

      // 3. Mark receipt status CONFIRMED
      const updatedReceipt = await tx.receipt.update({
        where: { id: receipt.id },
        data: {
          status: 'CONFIRMED',
          merchant: merchant || receipt.merchant,
          date: date || receipt.date,
          totalCents: typeof totalCents === 'number' ? totalCents : receipt.totalCents,
        },
      })

      // 4. Record AuditLog entry
      await tx.auditLog.create({
        data: {
          action: 'CONFIRM_RECEIPT',
          entityType: 'RECEIPT',
          entityId: receipt.id,
          userId: user.id,
          details: {
            linesCount: lines.length,
            matchedCount: lines.filter((l) => l.matchedProductId).length,
            clampedProductsCount: clampedProducts.length,
            clampedProducts,
          },
        },
      })

      return { updatedReceipt, createdLines, clampedProducts }
    })

    // 5. Post-transaction check: identify which products are now below their minimum stock threshold
    const allProducts = await prisma.product.findMany({
      where: { userId: user.id },
    })

    const lowStockProducts = allProducts
      .filter((p) => isLowStock(p.currentStock, p.minStock) || isOutOfStock(p.currentStock))
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        currentStock: p.currentStock,
        minStock: p.minStock,
        deficit: p.minStock - p.currentStock,
        isOutOfStock: isOutOfStock(p.currentStock),
      }))

    return NextResponse.json({
      data: {
        receiptId: result.updatedReceipt.id,
        status: 'CONFIRMED',
        message: 'Receipt confirmed successfully! Stock levels deducted and movements recorded.',
        clampedLinesCount: result.clampedProducts.length,
        lowStockProducts,
        unmatchedLinesCount: lines.filter((l) => !l.matchedProductId).length,
      },
    })
  } catch (error) {
    console.error('Error confirming receipt:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to confirm receipt' },
      { status: 500 }
    )
  }
}

