import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  iconColor?: string
  iconBg?: string
  badgeText?: string
  badgeVariant?: 'default' | 'success' | 'warning' | 'destructive' | 'neutral'
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'text-blue-400',
  iconBg = 'bg-blue-500/10 border-blue-500/20',
  badgeText,
  badgeVariant = 'neutral',
}: StatCardProps) {
  return (
    <Card className="bg-[#0a1322] border-[#1c3258] hover:border-slate-600 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            {title}
          </span>
          <div
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center border',
              iconBg
            )}
          >
            <Icon className={cn('w-4 h-4', iconColor)} />
          </div>
        </div>

        <div className="mt-3 flex items-baseline justify-between">
          <div className="text-2xl font-bold tracking-tight text-white">
            {value}
          </div>
          {badgeText && (
            <span
              className={cn(
                'text-[10px] font-semibold px-2 py-0.5 rounded border',
                badgeVariant === 'warning' && 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                badgeVariant === 'destructive' && 'bg-red-500/15 text-red-300 border-red-500/30',
                badgeVariant === 'success' && 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                badgeVariant === 'neutral' && 'bg-[#13233f] text-slate-300 border-[#1c3258]'
              )}
            >
              {badgeText}
            </span>
          )}
        </div>

        {subtitle && (
          <p className="mt-1 text-xs text-slate-400">
            {subtitle}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

