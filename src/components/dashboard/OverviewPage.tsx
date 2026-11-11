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
} from 'lucide-react'
import Link from 'next/link'
import { StatCard } from './StatCard'
import { LowStockList } from './LowStockList'
import { RecentActivity } from './RecentActivity'
import { Button } from '@/components/ui/button'
import { formatCurrency, isLowStock, isOutOfStock } from '@/lib/utils'
import type { Product, OverviewStats } from '@/types'

export default function OverviewPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/inventory', { cache: 'no-store' })
      if (!res.ok) {
        const errorJson = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(errorJson.error || `HTTP Error ${res.status}`)
      }
      const json = (await res.json()) as { data: Product[] }
      const items = json.data || []

      const totalVal = items.reduce((sum, p) => sum + p.currentStock * p.unitCost, 0)
      const lowItems = items.filter(
        (p) => isLowStock(p.currentStock, p.minStock) || isOutOfStock(p.currentStock)
      )

      setProducts(items)
      setStats({
        totalInventoryValue: totalVal,
        totalProducts: items.length,
        lowStockCount: lowItems.length,
        monthlyProcurementSpend: 0,
        pendingApprovals: 0,
        completedPurchases: 0,
      })
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

        {/* 4. Monthly Procurement Spend (0 for now) */}
        <StatCard
          title="Monthly Spend"
          value="$0.00"
          subtitle="Budget cap: $2,000.00/mo"
          icon={CreditCard}
          iconColor="text-purple-400"
          iconBg="bg-purple-500/10 border-purple-500/20"
          badgeText="Part 4: PayPal"
          badgeVariant="neutral"
        />

        {/* 5. Pending Approvals (0 for now) */}
        <StatCard
          title="Pending Approvals"
          value={0}
          subtitle="Threshold: >$100.00 requires review"
          icon={CheckCircle2}
          iconColor="text-cyan-400"
          iconBg="bg-cyan-500/10 border-cyan-500/20"
          badgeText="Part 2: Approvals"
          badgeVariant="neutral"
        />

        {/* 6. Completed Purchases (0 for now) */}
        <StatCard
          title="Completed Purchases"
          value={0}
          subtitle="Executed purchase orders"
          icon={Receipt}
          iconColor="text-slate-400"
          iconBg="bg-[#13233f] border-[#1c3258]"
          badgeText="Part 4: Orders"
          badgeVariant="neutral"
        />
      </div>

      {/* Grid of Low Stock Alerts & Recent Agent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <LowStockList products={lowStockProducts} />
        <RecentActivity />
      </div>
    </div>
  )
}

