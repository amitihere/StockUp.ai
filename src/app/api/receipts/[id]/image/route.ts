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
      select: {
        imageData: true,
        mimeType: true,
      },
    })

    if (!receipt || !receipt.imageData) {
      return new NextResponse('Receipt image not found', { status: 404 })
    }

    return new NextResponse(receipt.imageData as unknown as BodyInit, {
      headers: {
        'Content-Type': receipt.mimeType || 'image/png',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    })
  } catch (error) {
    console.error('Error serving receipt image:', error)
    return new NextResponse('Internal error serving image', { status: 500 })
  }
}
