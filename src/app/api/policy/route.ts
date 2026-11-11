import { NextRequest, NextResponse } from 'next/server'
import { getDemoUser, getPolicy, updatePolicy } from '@/services/inventory'
import { policyUpdateSchema } from '@/lib/validations'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getDemoUser()
    const policy = await getPolicy(user.id)
    return NextResponse.json({ data: policy })
  } catch (error) {
    console.error('Error in GET /api/policy:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve procurement policy' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getDemoUser()
    const body: unknown = await request.json().catch(() => null)

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request payload: JSON body is required' },
        { status: 400 }
      )
    }

    const validation = policyUpdateSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const updatedPolicy = await updatePolicy(user.id, validation.data)
    return NextResponse.json({ data: updatedPolicy })
  } catch (error) {
    console.error('Error in PUT /api/policy:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update procurement policy' },
      { status: 500 }
    )
  }
}
