import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDemoUser } from '@/services/inventory'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getDemoUser()
    const receiptId = params.id

    const receipt = await prisma.receipt.findFirst({
      where: {
        id: receiptId,
        userId: user.id,
      },
      include: {
        lineItems: {
          include: {
            matchedProduct: {
              select: {
                id: true,
                name: true,
                sku: true,
                category: true,
                currentStock: true,
                minStock: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        procurementRuns: {
          include: {
            purchaseOrders: {
              select: {
                id: true,
                status: true,
                totalAmount: true,
              },
            },
          },
        },
      },
    })

    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    // Check if totals match
    const lineSumCents = receipt.lineItems.reduce(
      (sum, l) => sum + (l.lineTotal || l.unitPrice * l.quantity - l.discount),
      0
    )
    const discrepancyCents = Math.abs(lineSumCents - receipt.totalCents)
    const totalsMatch = discrepancyCents === 0

    return NextResponse.json({
      data: {
        id: receipt.id,
        merchant: receipt.merchant,
        date: receipt.date,
        status: receipt.status,
        totalCents: receipt.totalCents,
        currency: receipt.currency,
        fileHash: receipt.fileHash,
        hasImage: !!receipt.imageData,
        extractedJson: receipt.extractedJson,
        lineItems: receipt.lineItems,
        lineSumCents,
        totalsMatch,
        discrepancyCents,
        createdAt: receipt.createdAt,
        procurementRuns: receipt.procurementRuns,
      },
    })
  } catch (error) {
    console.error('Error fetching receipt details:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch receipt' },
      { status: 500 }
    )
  }
}

