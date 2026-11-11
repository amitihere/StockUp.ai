'use client'

import { usePathname } from 'next/navigation'
import { Bell, ShieldCheck, Cpu } from 'lucide-react'

const routeMeta: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': {
    title: 'Executive Overview',
    subtitle: 'Real-time inventory metrics and autonomous procurement indicators',
  },
  '/dashboard/inventory': {
    title: 'Product Catalog & Inventory',
    subtitle: 'Stock thresholds, unit economics, and supplier catalog management',
  },
  '/dashboard/ai-procurement': {
    title: 'AI Procurement Engine',
    subtitle: 'Autonomous replenishment runs, supplier negotiations, and draft orders',
  },
  '/dashboard/product-discovery': {
    title: 'Product Discovery',
    subtitle: 'Channel3 supplier network search, product benchmarking, and pricing',
  },
  '/dashboard/approvals': {
    title: 'Procurement Approvals',
    subtitle: 'Purchase order review, budget compliance checks, and approval gates',
  },
  '/dashboard/transactions': {
    title: 'Transactions & Payments',
    subtitle: 'PayPal sandbox capture logs, settled payments, and audit trail',
  },
  '/dashboard/receipts': {
    title: 'Receipt Intelligence',
    subtitle: 'Sales receipt vision OCR, stock deduction, and demand forecasting',
  },
  '/dashboard/settings': {
    title: 'Procurement Policy Settings',
    subtitle: 'Autonomous budget limits, approval thresholds, and supplier quality gates',
  },
}

export function TopBar() {
  const pathname = usePathname()
  const meta = routeMeta[pathname] || {
    title: 'StockPilot Dashboard',
    subtitle: 'AI-Powered Procurement Platform',
  }

  return (
    <header className="h-16 flex-shrink-0 bg-[#0a1322] border-b border-[#1c3258] px-8 flex items-center justify-between">
      {/* Title & Subtitle */}
      <div className="flex flex-col">
        <h1 className="text-base font-semibold text-white tracking-tight leading-tight">
          {meta.title}
        </h1>
        <p className="text-xs text-slate-400">
          {meta.subtitle}
        </p>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-4">
        {/* Policy Shield Indicator */}
        <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#0e1a2f] border border-[#1c3258] text-xs text-slate-300">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-medium text-slate-300">Policy Engine Active</span>
        </div>

        {/* System Agent Status */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
          <Cpu className="w-3.5 h-3.5" />
          <span className="font-medium">Agent Idle</span>
        </div>

        {/* Demo Mode Badge */}
        <div className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          Demo Mode
        </div>

        {/* Notifications Icon Button */}
        <button
          type="button"
          aria-label="System Notifications"
          className="relative p-2 rounded-lg bg-[#0e1a2f] border border-[#1c3258] text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-[#0a1322]" />
        </button>
      </div>
    </header>
  )
}

