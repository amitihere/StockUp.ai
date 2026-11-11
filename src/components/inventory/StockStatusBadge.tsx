import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { StockStatus } from '@/types'

interface StockStatusBadgeProps {
  status: StockStatus
}

export function StockStatusBadge({ status }: StockStatusBadgeProps) {
  if (status === 'out') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-300 border border-red-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
        Out of Stock
      </span>
    )
  }

  if (status === 'low') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
        Low Stock
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      Healthy
    </span>
  )
}

