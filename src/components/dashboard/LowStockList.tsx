'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowRight, PackageCheck, AlertCircle } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, isOutOfStock } from '@/lib/utils'
import type { Product } from '@/types'

interface LowStockListProps {
  products: Product[]
}

export function LowStockList({ products }: LowStockListProps) {
  return (
    <Card className="bg-[#0a1322] border-[#1c3258]">
      <CardHeader className="p-5 pb-3 border-b border-[#1c3258] flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold text-white">
              Low Stock Alerts
            </CardTitle>
            <p className="text-xs text-slate-400">
              Products below required replenishment thresholds
            </p>
          </div>
        </div>

        <Link href="/dashboard/inventory">
          <Button variant="ghost" size="sm" className="text-xs text-blue-400 hover:text-blue-300 gap-1.5 h-8">
            <span>Manage Inventory</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </CardHeader>

      <CardContent className="p-0">
        {products.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center px-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-3">
              <PackageCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-slate-200">Inventory Healthy</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              All active product lines are currently above their configured minimum stock thresholds.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#1c3258]">
            {products.map((item) => {
              const outOfStock = isOutOfStock(item.currentStock)
              const deficit = item.minStock - item.currentStock

              return (
                <div
                  key={item.id}
                  className="p-4 flex items-center justify-between hover:bg-[#0e1a2f] transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        outOfStock ? 'bg-red-400' : 'bg-amber-400'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-slate-100 truncate">
                          {item.name}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#13233f] text-slate-400 border border-[#1c3258]">
                          {item.sku}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span>Category: {item.category}</span>
                        <span>•</span>
                        <span>Cost: {formatCurrency(item.unitCost)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                    <div className="text-right">
                      <div className="flex items-baseline justify-end gap-1">
                        <span
                          className={`text-sm font-bold ${
                            outOfStock ? 'text-red-400' : 'text-amber-400'
                          }`}
                        >
                          {item.currentStock}
                        </span>
                        <span className="text-xs text-slate-500">/ {item.minStock} min</span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {outOfStock ? 'Out of stock' : `Deficit: -${deficit} units`}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                        outOfStock
                          ? 'bg-red-500/15 text-red-300 border-red-500/30'
                          : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {outOfStock ? 'Critical' : 'Restock'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

