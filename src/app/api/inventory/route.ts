import { NextRequest, NextResponse } from 'next/server'
import { getDemoUser, getProducts, createProduct } from '@/services/inventory'
import { productCreateSchema } from '@/lib/validations'
import { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getDemoUser()
    const products = await getProducts(user.id)
    return NextResponse.json({ data: products })
  } catch (error) {
    console.error('Error in GET /api/inventory:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve products' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getDemoUser()
    const body: unknown = await request.json().catch(() => null)

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request payload: JSON body is required' },
        { status: 400 }
      )
    }

    const validation = productCreateSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const newProduct = await createProduct(user.id, validation.data)
    return NextResponse.json({ data: newProduct }, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/inventory:', error)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A product with this SKU already exists.' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create product' },
      { status: 500 }
    )
  }
}
