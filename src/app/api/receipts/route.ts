import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDemoUser } from '@/services/inventory'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getDemoUser()

    const receipts = await prisma.receipt.findMany({
      where: { userId: user.id },
      include: {
        lineItems: {
          include: {
            matchedProduct: {
              select: {
                id: true,
                name: true,
                sku: true,
                currentStock: true,
                minStock: true,
              },
            },
          },
        },
        procurementRuns: {
          select: {
            id: true,
            status: true,
            startedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      data: receipts.map((r) => ({
        id: r.id,
        merchant: r.merchant || 'Store Receipt',
        date: r.date,
        status: r.status,
        totalCents: r.totalCents,
        currency: r.currency,
        fileHash: r.fileHash,
        lineItemsCount: r.lineItems.length,
        matchedItemsCount: r.lineItems.filter((i) => i.matchedProductId).length,
        hasImage: !!r.imageData,
        createdAt: r.createdAt,
        procurementRuns: r.procurementRuns,
      })),
    })
  } catch (error) {
    console.error('Error fetching receipts:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch receipts' },
      { status: 500 }
    )
  }
}

