'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  DollarSign,
  Package,
  AlertTriangle,
  CreditCard,
  CheckCircle2,
  Receipt,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  TrendingUp,
  Sparkles,
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'
import { StatCard } from './StatCard'
import { LowStockList } from './LowStockList'
import { RecentActivity, ActivitySummary } from './RecentActivity'
import { Button } from '@/components/ui/button'
import { formatCurrency, isLowStock, isOutOfStock } from '@/lib/utils'
import type { Product, OverviewStats } from '@/types'

interface TopSellerItem {
  productId: string
  name: string
  sku: string
  category: string
  currentStock: number
  minStock: number
  unitsSold30d: number
  avgDailySales: number
  recommendedCover14d: number
}

export default function OverviewPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [activities, setActivities] = useState<ActivitySummary[]>([])
  const [topSellers, setTopSellers] = useState<TopSellerItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/dashboard/overview', { cache: 'no-store' })
      if (!res.ok) {
        const errorJson = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(errorJson.error || `HTTP Error ${res.status}`)
      }
      const json = (await res.json()) as {
        data: {
          products: Product[]
          stats: OverviewStats
          activities: ActivitySummary[]
          topSellers?: TopSellerItem[]
        }
      }

      setProducts(json.data.products || [])
      setStats(json.data.stats)
      setActivities(json.data.activities || [])
      setTopSellers(json.data.topSellers || [])
    } catch (err) {
      console.error('Failed to load overview data:', err)
      setError(err instanceof Error ? err.message : 'Unknown network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const lowStockProducts = products.filter(
    (p) => isLowStock(p.currentStock, p.minStock) || isOutOfStock(p.currentStock)
  )

  return (
    <div className="space-y-6">
      {/* Overview Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-[#1c3258]">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Store Performance & Health
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time catalog analytics and procurement pipeline
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchData()}
            disabled={loading}
            className="border-[#1c3258] bg-[#0a1322] text-slate-300 hover:text-white hover:bg-[#13233f] text-xs h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </Button>

          <Link href="/dashboard/inventory">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8 gap-1.5 shadow-sm">
              <span>View Full Inventory</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-red-300">Unable to load inventory data</p>
            <p className="text-red-400/80 text-xs mt-0.5">{error}</p>
            <p className="text-slate-400 text-xs mt-2">
              Ensure PostgreSQL is running and you have executed <code className="text-slate-200 bg-[#0e1a2f] px-1 py-0.5 rounded font-mono">npm run prisma:migrate</code> and <code className="text-slate-200 bg-[#0e1a2f] px-1 py-0.5 rounded font-mono">npm run prisma:seed</code>.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchData()}
            className="border-red-500/30 text-red-300 hover:bg-red-500/20 text-xs"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Six Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 1. Total Inventory Value */}
        <StatCard
          title="Total Inventory Value"
          value={loading ? '...' : formatCurrency(stats?.totalInventoryValue ?? 0)}
          subtitle="Capital tied in on-hand inventory"
          icon={DollarSign}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/10 border-emerald-500/20"
          badgeText="Active"
          badgeVariant="success"
        />

        {/* 2. Number of Products */}
        <StatCard
          title="Product Catalog"
          value={loading ? '...' : (stats?.totalProducts ?? 0)}
          subtitle="Unique SKU items tracked"
          icon={Package}
          iconColor="text-blue-400"
          iconBg="bg-blue-500/10 border-blue-500/20"
          badgeText="Catalog"
          badgeVariant="neutral"
        />

        {/* 3. Low-Stock Products */}
        <StatCard
          title="Low-Stock Alerts"
          value={loading ? '...' : (stats?.lowStockCount ?? 0)}
          subtitle="Items below min threshold"
          icon={AlertTriangle}
          iconColor={stats && stats.lowStockCount > 0 ? 'text-amber-400' : 'text-slate-400'}
          iconBg={
            stats && stats.lowStockCount > 0
              ? 'bg-amber-500/10 border-amber-500/20'
              : 'bg-[#13233f] border-[#1c3258]'
          }
          badgeText={stats && stats.lowStockCount > 0 ? 'Action Needed' : 'Nominal'}
          badgeVariant={stats && stats.lowStockCount > 0 ? 'warning' : 'neutral'}
        />

        {/* 4. Monthly Procurement Spend (Real numbers from approved/paid orders) */}
        <StatCard
          title="Monthly Spend"
          value={loading ? '...' : formatCurrency(stats?.monthlyProcurementSpend ?? 0)}
          subtitle="Committed & paid orders this month"
          icon={CreditCard}
          iconColor="text-purple-400"
          iconBg="bg-purple-500/10 border-purple-500/20"
          badgeText={stats && stats.monthlyProcurementSpend > 0 ? 'Active' : 'Nominal'}
          badgeVariant={stats && stats.monthlyProcurementSpend > 0 ? 'success' : 'neutral'}
        />

        {/* 5. Pending Approvals */}
        <StatCard
          title="Pending Approvals"
          value={loading ? '...' : (stats?.pendingApprovals ?? 0)}
          subtitle="Orders awaiting merchant signoff"
          icon={CheckCircle2}
          iconColor={stats && stats.pendingApprovals > 0 ? 'text-amber-400' : 'text-slate-400'}
          iconBg={
            stats && stats.pendingApprovals > 0
              ? 'bg-amber-500/10 border-amber-500/20'
              : 'bg-[#13233f] border-[#1c3258]'
          }
          badgeText={stats && stats.pendingApprovals > 0 ? 'Awaiting Signoff' : 'None'}
          badgeVariant={stats && stats.pendingApprovals > 0 ? 'warning' : 'neutral'}
        />

        {/* 6. Completed Purchases (Real numbers from PAID orders) */}
        <StatCard
          title="Completed Purchases"
          value={loading ? '...' : (stats?.completedPurchases ?? 0)}
          subtitle="Orders paid via PayPal Sandbox"
          icon={Receipt}
          iconColor={stats && stats.completedPurchases > 0 ? 'text-emerald-400' : 'text-slate-400'}
          iconBg={
            stats && stats.completedPurchases > 0
              ? 'bg-emerald-500/10 border-emerald-500/20'
              : 'bg-[#13233f] border-[#1c3258]'
          }
          badgeText={stats && stats.completedPurchases > 0 ? 'Settled' : 'None'}
          badgeVariant={stats && stats.completedPurchases > 0 ? 'success' : 'neutral'}
        />
      </div>

      {/* Demand from Sales (Top Sellers 30d) Section (Section 5) */}
      <div className="rounded-xl border border-[#1c3258] bg-[#0a1322] p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#1c3258]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Demand from Sales (Top Sellers · 30d)
                </h3>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Receipt Velocity
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Real customer sales volume calculated from confirmed physical receipts to drive 14-day restock buffers.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/receipts"
            className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors self-start sm:self-auto"
          >
            <span>Inspect Sales Receipts</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {topSellers.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No receipt sales movements recorded in the last 30 days. Upload sales receipts to track dynamic product demand.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pt-4">
            {topSellers.map((item, idx) => (
              <div
                key={item.productId}
                className="p-3 rounded-lg bg-[#0e1a2f] border border-[#1c3258] flex flex-col justify-between space-y-2 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-white block truncate">
                      {idx + 1}. {item.name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono block">
                      SKU: {item.sku} · {item.category}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex-shrink-0">
                    {item.unitsSold30d} sold
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#1c3258]/60 text-[11px]">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Daily Rate</span>
                    <span className="font-semibold text-slate-200">
                      {item.avgDailySales}/day
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">On Hand</span>
                    <span
                      className={`font-semibold ${
                        item.currentStock < item.minStock
                          ? 'text-amber-400'
                          : 'text-slate-200'
                      }`}
                    >
                      {item.currentStock} / min {item.minStock}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block">14d Buffer</span>
                    <span className="font-bold text-blue-400">
                      {item.recommendedCover14d} units
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grid of Low Stock Alerts & Recent Agent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <LowStockList products={lowStockProducts} />
        <RecentActivity activities={activities} />
      </div>
    </div>
  )
}

