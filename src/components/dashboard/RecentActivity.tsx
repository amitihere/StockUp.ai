'use client'

import Link from 'next/link'
import { Bot, Sparkles, Clock, ArrowRight, CheckCircle2, Cpu } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export interface ActivitySummary {
  id: string
  runId: string
  type: string
  toolName: string | null
  outputData: any
  createdAt: string | Date
}

interface RecentActivityProps {
  activities?: ActivitySummary[]
}

export function RecentActivity({ activities = [] }: RecentActivityProps) {
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

        <Link href="/dashboard/ai-procurement">
          <Button variant="ghost" size="sm" className="text-xs text-blue-400 hover:text-blue-300 gap-1.5 h-8">
            <span>Agent Console</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </CardHeader>

      <CardContent className="p-0">
        {activities.length === 0 ? (
          <div className="p-6 py-12 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#0e1a2f] border border-[#1c3258] flex items-center justify-center mb-4 shadow-inner">
              <Sparkles className="w-6 h-6 text-blue-400/60" />
            </div>

            <h4 className="text-sm font-semibold text-slate-200">
              No Autonomous Runs Yet
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mt-1.5 leading-relaxed">
              Dispatch the AI agent from the AI Procurement console to analyze low stock, compare Channel3 suppliers, and assemble proposals.
            </p>

            <Link href="/dashboard/ai-procurement" className="mt-4">
              <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8">
                Launch First Run
              </Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[#1c3258]">
            {activities.map((act) => {
              const time = new Date(act.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
              const duration = act.outputData?.durationMs

              return (
                <div
                  key={act.id}
                  className="p-3.5 px-5 flex items-center justify-between hover:bg-[#0e1a2f] transition-colors text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-[#0e1a2f] border border-[#1c3258] flex items-center justify-center text-blue-400 flex-shrink-0">
                      <Cpu className="w-3.5 h-3.5" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-white">
                          {act.toolName || act.type}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Run: {act.runId.slice(-6)}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] truncate mt-0.5 max-w-xs">
                        {act.type === 'DECISION'
                          ? act.outputData?.text?.slice(0, 75) + '...'
                          : act.toolName === 'create_purchase_proposal'
                          ? 'Created restock proposal: ' + act.outputData?.result?.totalAmountFormatted
                          : act.toolName === 'request_approval'
                          ? 'Submitted PurchaseOrder in AWAITING_APPROVAL'
                          : act.toolName === 'search_products'
                          ? 'Searched Channel3 catalog'
                          : 'Executed agent tool step'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0 ml-3 text-right">
                    {duration !== undefined && (
                      <span className="text-[10px] text-slate-500 font-mono">
                        {duration}ms
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400 font-mono">
                      {time}
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
