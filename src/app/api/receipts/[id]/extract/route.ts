import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDemoUser } from '@/services/inventory'
import { extractReceiptFromImage } from '@/services/receipts/extraction'

export const dynamic = 'force-dynamic'

export async function POST(
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
    })

    if (!receipt) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })
    }

    if (receipt.status === 'CONFIRMED') {
      return NextResponse.json(
        { error: 'Cannot re-extract an already confirmed receipt.' },
        { status: 400 }
      )
    }

    if (!receipt.imageData) {
      return NextResponse.json(
        { error: 'Receipt does not contain image data to extract.' },
        { status: 400 }
      )
    }

    // Set status to EXTRACTING while processing
    await prisma.receipt.update({
      where: { id: receipt.id },
      data: { status: 'EXTRACTING' },
    })

    // Fetch store inventory products for matching
    const products = await prisma.product.findMany({
      where: { userId: user.id },
    })

    try {
      const extraction = await extractReceiptFromImage(
        receipt.imageData,
        receipt.mimeType || 'image/png',
        products
      )

      // Replace existing lines with newly extracted lines in a transaction
      await prisma.$transaction(async (tx) => {
        await tx.receiptLineItem.deleteMany({
          where: { receiptId: receipt.id },
        })

        await tx.receipt.update({
          where: { id: receipt.id },
          data: {
            status: 'EXTRACTED',
            merchant: extraction.merchant,
            date: extraction.date,
            totalCents: extraction.totalCents,
            currency: extraction.currency,
            extractedJson: extraction as any,
          },
        })

        for (const line of extraction.lines) {
          await tx.receiptLineItem.create({
            data: {
              receiptId: receipt.id,
              rawName: line.description,
              sku: line.sku,
              quantity: line.quantity,
              unitPrice: line.unitPriceCents,
              discount: line.discountCents,
              lineTotal: line.lineTotalCents,
              confidence: line.confidence,
              matchedProductId: line.matchedProductId,
              currency: extraction.currency,
            },
          })
        }
      })

      return NextResponse.json({
        data: {
          receiptId: receipt.id,
          status: 'EXTRACTED',
          merchant: extraction.merchant,
          date: extraction.date,
          totalCents: extraction.totalCents,
          totalsMatch: extraction.totalsMatch,
          lineSumCents: extraction.lineSumCents,
          linesCount: extraction.lines.length,
          extraction,
        },
      })
    } catch (extractErr) {
      const errorMessage =
        extractErr instanceof Error ? extractErr.message : String(extractErr)
      console.error(`[POST /api/receipts/${receipt.id}/extract Error]:`, errorMessage)

      await prisma.receipt.update({
        where: { id: receipt.id },
        data: {
          status: 'EXTRACTION_FAILED',
          extractedJson: {
            error: errorMessage,
          },
        },
      })

      return NextResponse.json(
        {
          error: errorMessage,
          data: {
            receiptId: receipt.id,
            status: 'EXTRACTION_FAILED',
            error: errorMessage,
          },
        },
        { status: 422 }
      )
    }
  } catch (error) {
    console.error('Error in POST /api/receipts/[id]/extract:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to re-run extraction' },
      { status: 500 }
    )
  }
}

