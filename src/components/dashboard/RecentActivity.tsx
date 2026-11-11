'use client'

import { Bot, Sparkles, Clock, ShieldAlert } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function RecentActivity() {
  return (
    <Card className="bg-[#0a1322] border-[#1c3258]">
      <CardHeader className="p-5 pb-3 border-b border-[#1c3258] flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold text-white">
              Recent Agent Activity
            </CardTitle>
            <p className="text-xs text-slate-400">
              Autonomous search, tool invocations, and order proposals
            </p>
          </div>
        </div>

        <Badge variant="outline" className="text-[10px] text-slate-400 border-[#1c3258]">
          <Clock className="w-3 h-3 mr-1 text-slate-500" />
          Realtime
        </Badge>
      </CardHeader>

      <CardContent className="p-6">
        <div className="py-10 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#0e1a2f] border border-[#1c3258] flex items-center justify-center mb-4 shadow-inner">
            <Sparkles className="w-6 h-6 text-blue-400/60" />
          </div>

          <h4 className="text-sm font-semibold text-slate-200">
            No Autonomous Runs Yet
          </h4>
          <p className="text-xs text-slate-400 max-w-sm mt-1.5 leading-relaxed">
            The StockPilot AI agent executes when inventory falls below minimum stock thresholds or when triggered by incoming sales receipts.
          </p>

          <div className="mt-5 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0e1a2f] border border-[#1c3258] text-[11px] text-slate-400">
            <ShieldAlert className="w-3.5 h-3.5 text-blue-400" />
            <span>AI Tool Execution & Audit Trail coming in Part 2</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

