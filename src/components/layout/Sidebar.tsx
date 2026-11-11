'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Package,
  Bot,
  Compass,
  CheckCircle2,
  CreditCard,
  ReceiptText,
  Settings,
  Sparkles,
  Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  isPlaceholder?: boolean
}

const navItems: NavItem[] = [
  {
    name: 'Overview',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    name: 'Inventory',
    href: '/dashboard/inventory',
    icon: Package,
  },
  {
    name: 'AI Procurement',
    href: '/dashboard/ai-procurement',
    icon: Bot,
    badge: 'Part 2',
    isPlaceholder: true,
  },
  {
    name: 'Product Discovery',
    href: '/dashboard/product-discovery',
    icon: Compass,
    badge: 'Part 3',
    isPlaceholder: true,
  },
  {
    name: 'Approvals',
    href: '/dashboard/approvals',
    icon: CheckCircle2,
    badge: 'Part 2',
    isPlaceholder: true,
  },
  {
    name: 'Transactions',
    href: '/dashboard/transactions',
    icon: CreditCard,
    badge: 'Part 4',
    isPlaceholder: true,
  },
  {
    name: 'Receipts',
    href: '/dashboard/receipts',
    icon: ReceiptText,
    badge: 'Part 4',
    isPlaceholder: true,
  },
  {
    name: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col bg-[#0a1322] border-r border-[#1c3258] select-none h-screen">
      {/* Brand Logo Header */}
      <div className="h-16 flex items-center px-6 border-b border-[#1c3258] gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white font-bold text-lg">
          <Layers className="w-5 h-5" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-white text-base tracking-tight">StockPilot</span>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1 rounded">
              v1.0
            </span>
          </div>
          <span className="text-[11px] text-slate-400">Autonomous Procurement</span>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 py-4 px-3 overflow-y-auto space-y-1">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Core Operations
        </div>
        {navItems.map((item) => {
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)

          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 font-semibold shadow-inner'
                  : 'text-slate-300 hover:bg-[#13233f] hover:text-white',
                item.isPlaceholder && !isActive && 'text-slate-400'
              )}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={cn(
                    'w-4 h-4 transition-colors',
                    isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200'
                  )}
                />
                <span>{item.name}</span>
              </div>

              {item.badge && (
                <span
                  className={cn(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors',
                    isActive
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-[#13233f] text-slate-400 group-hover:text-slate-300'
                  )}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {/* AI Assistant Status Callout */}
      <div className="p-3 mx-3 mb-3 rounded-lg bg-[#0e1a2f] border border-[#1c3258]">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-semibold text-slate-200">Procurement Agent</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Autonomous restock engine standing by. Policy rules active.
        </p>
      </div>

      {/* User Profile Footer */}
      <div className="p-3 border-t border-[#1c3258] bg-[#070e1a]/70">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-semibold text-white text-xs ring-2 ring-blue-500/30">
            SO
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-slate-200 truncate">
              Demo Store Owner
            </span>
            <span className="text-[11px] text-slate-500 truncate">
              demo@stockpilot.ai
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}

