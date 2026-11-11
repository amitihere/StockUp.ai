import { NextRequest, NextResponse } from 'next/server'
import { getProductDetails } from '@/services/channel3'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: { id: string } | Promise<{ id: string }>
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const params = await context.params
    const id = params.id

    if (!id || id.trim() === '') {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 })
    }

    const product = await getProductDetails(id)
    return NextResponse.json({ data: product })
  } catch (error) {
    console.error('Error in GET /api/products/[id]:', error)
    const message = error instanceof Error ? error.message : 'Failed to retrieve product details'
    const status = message.includes('not found') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

