import { NextRequest, NextResponse } from 'next/server'
import { getDemoUser, getProductById, updateProduct, deleteProduct } from '@/services/inventory'
import { productUpdateSchema } from '@/lib/validations'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: { id: string } | Promise<{ id: string }>
}

async function extractId(context: RouteContext): Promise<string> {
  const resolved = await context.params
  return resolved.id
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getDemoUser()
    const id = await extractId(context)

    const product = await getProductById(id, user.id)
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    return NextResponse.json({ data: product })
  } catch (error) {
    console.error('Error in GET /api/inventory/[id]:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch product' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getDemoUser()
    const id = await extractId(context)

    const existing = await getProductById(id, user.id)
    if (!existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request payload: JSON body is required' },
        { status: 400 }
      )
    }

    const validation = productUpdateSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const updated = await updateProduct(id, user.id, validation.data)
    return NextResponse.json({ data: updated })
  } catch (error) {
    console.error('Error in PATCH /api/inventory/[id]:', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A product with this SKU already exists.' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update product' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const user = await getDemoUser()
    const id = await extractId(context)

    const existing = await getProductById(id, user.id)
    if (!existing) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    await deleteProduct(id)
    return NextResponse.json({ data: { id, success: true } })
  } catch (error) {
    console.error('Error in DELETE /api/inventory/[id]:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete product' },
      { status: 500 }
    )
  }
}
