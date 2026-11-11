import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Clock, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface PlaceholderPageProps {
  title: string
  partName: string
  partNumber: string
  description: string
  features: string[]
  icon: React.ComponentType<{ className?: string }>
}

export function PlaceholderPage({
  title,
  partName,
  partNumber,
  description,
  features,
  icon: Icon,
}: PlaceholderPageProps) {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between pb-2 border-b border-[#1c3258]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
              Coming in {partNumber}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        </div>

        <Link href="/dashboard">
          <Button
            variant="outline"
            size="sm"
            className="border-[#1c3258] bg-[#0a1322] text-slate-300 hover:text-white hover:bg-[#13233f] text-xs h-8 gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Overview</span>
          </Button>
        </Link>
      </div>

      <Card className="bg-[#0a1322] border-[#1c3258]">
        <CardContent className="p-8">
          <div className="flex flex-col items-center text-center max-w-md mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/10">
              <Icon className="w-7 h-7 text-blue-400" />
            </div>

            <h3 className="text-lg font-bold text-white">
              {title} Architecture Ready
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Database models, Prisma relations, and enterprise types for this feature have been established in Part 1. Functional implementation will activate in{' '}
              <strong className="text-slate-200">{partName} ({partNumber})</strong>.
            </p>

            <div className="w-full mt-6 p-4 rounded-lg bg-[#070e1a] border border-[#1c3258] text-left space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 border-b border-[#1c3258] pb-2">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>Planned Modules & Capabilities</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-400">
                {features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-blue-400 font-bold">•</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex items-center gap-2 text-[11px] text-slate-500">
              <Clock className="w-3.5 h-3.5" />
              <span>Target Roadmap Delivery: Part 2–4 of StockPilot</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

