import { NextRequest, NextResponse } from 'next/server'
import { searchProducts } from '@/services/channel3'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const searchSchema = z.object({
  query: z.string().trim().min(1, 'Search query is required'),
  limit: z.coerce.number().int().min(1).max(20).default(10),
})

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => null)
    const validation = searchSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Invalid search parameters',
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { query, limit } = validation.data
    const results = await searchProducts(query, limit)

    return NextResponse.json({ data: results })
  } catch (error) {
    console.error('Error in POST /api/products/search:', error)
    const message = error instanceof Error ? error.message : 'Failed to search products'
    const status = message.includes('API key') ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

