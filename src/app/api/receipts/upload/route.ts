import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { getDemoUser } from '@/services/inventory'
import { extractReceiptFromImage, ProcessedReceiptExtraction } from '@/services/receipts/extraction'

export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(request: NextRequest) {
  try {
    const user = await getDemoUser()

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type "${file.type}". Allowed types: JPEG, PNG, WebP.`,
        },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 5 MB limit.' },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Compute SHA-256 hash of image contents
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex')

    // Reject duplicates that were already CONFIRMED
    const existingConfirmed = await prisma.receipt.findFirst({
      where: {
        userId: user.id,
        fileHash,
        status: 'CONFIRMED',
      },
    })

    if (existingConfirmed) {
      return NextResponse.json(
        {
          error:
            'Duplicate receipt rejected: an identical sales receipt has already been confirmed and processed.',
          existingReceiptId: existingConfirmed.id,
        },
        { status: 409 }
      )
    }

    // Create initial Receipt record in UPLOADED status
    const receipt = await prisma.receipt.create({
      data: {
        userId: user.id,
        status: 'UPLOADED',
        imageData: buffer,
        mimeType: file.type,
        fileHash,
        totalCents: 0,
        currency: 'USD',
      },
    })

    // Fetch user inventory products for matching
    const products = await prisma.product.findMany({
      where: { userId: user.id },
    })

    // Run AI vision extraction
    let extraction: ProcessedReceiptExtraction | null = null
    try {
      extraction = await extractReceiptFromImage(buffer, file.type, products)

      // Update receipt with extracted data
      await prisma.$transaction(async (tx) => {
        await tx.receipt.update({
          where: { id: receipt.id },
          data: {
            status: 'EXTRACTED',
            merchant: extraction!.merchant,
            date: extraction!.date,
            totalCents: extraction!.totalCents,
            currency: extraction!.currency,
            extractedJson: extraction as any,
          },
        })

        // Create line items
        for (const line of extraction!.lines) {
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
              currency: extraction!.currency,
            },
          })
        }
      })
    } catch (extractErr) {
      console.error('Vision extraction error:', extractErr)
      // Allow fallback to manual entry if vision extraction fails
      await prisma.receipt.update({
        where: { id: receipt.id },
        data: {
          status: 'UPLOADED', // Keep uploaded so merchant can enter lines manually
          extractedJson: {
            error: extractErr instanceof Error ? extractErr.message : String(extractErr),
          },
        },
      })

      return NextResponse.json(
        {
          data: {
            receiptId: receipt.id,
            status: 'UPLOADED',
            warning:
              'Vision extraction could not parse structured lines automatically. Manual line entry is enabled.',
            fileHash,
          },
        },
        { status: 201 }
      )
    }

    return NextResponse.json(
      {
        data: {
          receiptId: receipt.id,
          status: 'EXTRACTED',
          merchant: extraction.merchant,
          date: extraction.date,
          totalCents: extraction.totalCents,
          totalsMatch: extraction.totalsMatch,
          lineSumCents: extraction.lineSumCents,
          linesCount: extraction.lines.length,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Receipt upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Receipt upload failed' },
      { status: 500 }
    )
  }
}
