import { NextResponse } from 'next/server'
import { getDemoUser, getOverviewStats, getRecentActivities, getProducts } from '@/services/inventory'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getDemoUser()
    const [products, stats, activities] = await Promise.all([
      getProducts(user.id),
      getOverviewStats(user.id),
      getRecentActivities(user.id, 6),
    ])

    return NextResponse.json({
      data: {
        products,
        stats,
        activities,
      },
    })
  } catch (error) {
    console.error('Error fetching dashboard overview:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch overview data' },
      { status: 500 }
    )
  }
}
