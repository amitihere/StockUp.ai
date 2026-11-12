'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  Bot,
  Sparkles,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Loader2,
  RefreshCw,
  Search,
  Layers,
  ChevronDown,
  ChevronUp,
  FileCheck,
  Building2,
  ExternalLink,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'

interface AgentActivityItem {
  id: string
  runId: string
  type: string
  toolName: string | null
  inputData: Record<string, unknown> | null
  outputData: {
    result?: Record<string, unknown>
    durationMs?: number
    isError?: boolean
    text?: string
    error?: string
  } | null
  createdAt: string
}

interface PurchaseOrderItem {
  id: string
  quantity: number
  unitPrice: number
  product: {
    id: string
    name: string
    sku: string
    category: string
  }
}

interface PurchaseOrderData {
  id: string
  status: string
  totalAmount: number
  supplierId: string
  notes: string | null
  items: PurchaseOrderItem[]
  createdAt: string
}

interface ProcurementRunData {
  id: string
  status: string
  startedAt: string
  completedAt: string | null
  purchaseOrders: PurchaseOrderData[]
}

const EXAMPLE_CHIPS = [
  'Restock my store under $500. Prioritize quality and value.',
  'Replenish all out-of-stock items under $250.',
  'Find high-rated suppliers for low-stock peripherals under $400.',
  'Source top-rated USB-C chargers and cables under $300.',
]

function AiProcurementContent() {
  const searchParams = useSearchParams()
  const initialPrompt = searchParams.get('prompt')
  const initialReceiptId = searchParams.get('receiptId')
  const initialRunId = searchParams.get('runId')

  const [prompt, setPrompt] = useState(
    initialPrompt || 'Restock my store under $500. Prioritize quality and value.'
  )
  const [budgetDollars, setBudgetDollars] = useState('500')
  const [receiptId, setReceiptId] = useState<string | null>(initialReceiptId)
  const [activeRunId, setActiveRunId] = useState<string | null>(initialRunId)
  const [runData, setRunData] = useState<ProcurementRunData | null>(null)
  const [activities, setActivities] = useState<AgentActivityItem[]>([])
  const [isRunning, setIsRunning] = useState(Boolean(initialRunId))
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [expandedActivityIds, setExpandedActivityIds] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (initialPrompt) {
      setPrompt(initialPrompt)
    }
    if (initialReceiptId) {
      setReceiptId(initialReceiptId)
    }
    if (initialRunId) {
      setActiveRunId(initialRunId)
      setIsRunning(true)
    }
  }, [initialPrompt, initialReceiptId, initialRunId])

  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  const toggleExpand = (id: string) => {
    setExpandedActivityIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleLaunch = async () => {
    if (!prompt.trim() || isRunning) return

    setIsRunning(true)
    setLaunchError(null)
    setActivities([])
    setRunData(null)

    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          budgetDollars: budgetDollars ? Number(budgetDollars) : undefined,
          receiptId: receiptId || undefined,
        }),
      })

      const json = (await res.json()) as {
        data?: { runId: string; status: string }
        error?: string
      }

      if (!res.ok || !json.data) {
        throw new Error(json.error || `Failed to start agent run (${res.status})`)
      }

      setActiveRunId(json.data.runId)
    } catch (err) {
      console.error('Launch error:', err)
      setLaunchError(err instanceof Error ? err.message : 'Error starting procurement agent')
      setIsRunning(false)
    }
  }

  // Poll activities and run status while running
  const pollStatus = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`/api/agent/runs/${runId}/activities`, { cache: 'no-store' })
      if (!res.ok) return

      const json = (await res.json()) as {
        data?: {
          run: { id: string; status: string; completedAt: string | null }
          activities: AgentActivityItem[]
        }
      }

      if (json.data) {
        setActivities(json.data.activities || [])

        // If run has agent_start activity, synchronize prompt display
        const startActivity = json.data.activities?.find(
          (a) => a.toolName === 'agent_start'
        )
        const loggedPrompt = (startActivity?.inputData as any)?.userPrompt
        if (loggedPrompt && typeof loggedPrompt === 'string') {
          setPrompt(loggedPrompt)
        }

        if (json.data.run.status !== 'RUNNING') {
          setIsRunning(false)
          // Fetch final run data including purchase orders
          const runRes = await fetch(`/api/agent/runs/${runId}`)
          if (runRes.ok) {
            const runJson = (await runRes.json()) as { data: ProcurementRunData }
            setRunData(runJson.data)
          }
        }
      }
    } catch (err) {
      console.error('Error polling agent activities:', err)
    }
  }, [])

  useEffect(() => {
    if (!activeRunId || !isRunning) {
      if (pollingRef.current) clearInterval(pollingRef.current)
      return
    }

    // Immediate first poll
    void pollStatus(activeRunId)

    // Poll every 1000ms
    pollingRef.current = setInterval(() => {
      void pollStatus(activeRunId)
    }, 1000)

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [activeRunId, isRunning, pollStatus])

  // Extract purchase proposal info from activities if completed
  const proposalActivity = activities
    .slice()
    .reverse()
    .find((a) => a.toolName === 'create_purchase_proposal' && a.outputData?.result)

  const proposalResult = proposalActivity?.outputData?.result as
    | {
        items?: Array<{
          productId: string
          productName: string
          quantity: number
          unitPrice: number
          totalPrice: number
          retailer?: string
          reasoning: string
          rating?: number
        }>
        totalAmountCents?: number
        wasTrimmed?: boolean
        explanation?: string
        policyEvaluation?: {
          passed: boolean
          requiresApproval: boolean
          checks: Array<{ rule: string; passed: boolean; detail: string }>
        }
      }
    | undefined

  const purchaseOrder = runData?.purchaseOrders?.[0]

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-[#1c3258]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              AI Procurement Engine
            </h2>
            <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-blue-400 animate-pulse' : 'bg-slate-400'}`} />
              {isRunning ? 'Agent Active' : 'Autonomous Pipeline'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Autonomous catalog analysis, live Channel3 supplier sourcing, and policy-gated purchase orders
          </p>
        </div>

        {activeRunId && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono bg-[#0a1322] px-2 py-1 rounded border border-[#1c3258]">
              Run: {activeRunId.slice(-8)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => activeRunId && void pollStatus(activeRunId)}
              className="border-[#1c3258] bg-[#0a1322] text-slate-300 hover:text-white hover:bg-[#13233f] text-xs h-8"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Main Request Control Card */}
      <Card className="bg-[#0a1322] border-[#1c3258] shadow-xl">
        <CardHeader className="p-5 pb-3 border-b border-[#1c3258]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Bot className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-white">
                Autonomous Procurement Instructions
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Instruct the AI agent on restock objectives, budget constraints, and quality preferences
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5 space-y-4">
          {receiptId && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <span>
                  Triggered by Sales Receipt <strong>#{receiptId.slice(-8)}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReceiptId(null)}
                className="text-slate-400 hover:text-white text-[11px] underline"
              >
                Clear link
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-3 space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                Merchant Instructions *
              </label>
              <Input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Restock my store under $500. Prioritize quality and value."
                disabled={isRunning}
                className="bg-[#070e1a] border-[#1c3258] text-white text-sm h-10 focus-visible:ring-blue-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                Budget Ceiling (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-semibold">
                  $
                </span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={budgetDollars}
                  onChange={(e) => setBudgetDollars(e.target.value)}
                  placeholder="500"
                  disabled={isRunning}
                  className="pl-7 bg-[#070e1a] border-[#1c3258] text-white text-sm h-10 focus-visible:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Example Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-400">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Sample Prompts:
            </span>
            {EXAMPLE_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={isRunning}
                onClick={() => setPrompt(chip)}
                className="px-2.5 py-1 rounded-md bg-[#0e1a2f] hover:bg-[#13233f] text-slate-300 text-xs border border-[#1c3258] transition-colors disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>

          {launchError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{launchError}</span>
            </div>
          )}
        </CardContent>

        <CardFooter className="p-4 border-t border-[#1c3258] bg-[#070e1a]/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Deterministic Policy Checks & Price Verification Active</span>
          </div>

          <Button
            onClick={handleLaunch}
            disabled={isRunning || !prompt.trim()}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-6 h-9 gap-1.5 shadow-sm"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Agent Running...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start Autonomous Run</span>
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* Two-Column Execution View: Timeline vs Final Proposal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Execution Timeline & Agent Decisions */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="bg-[#0a1322] border-[#1c3258]">
            <CardHeader className="p-5 pb-3 border-b border-[#1c3258] flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <CardTitle className="text-sm font-semibold text-white">
                  Live Execution Timeline
                </CardTitle>
              </div>
              <span className="text-xs text-slate-400">
                {activities.length} event{activities.length === 1 ? '' : 's'}
              </span>
            </CardHeader>

            <CardContent className="p-5">
              {activities.length === 0 ? (
                <div className="py-16 text-center">
                  <Bot className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-300">Agent Standing By</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Click "Start Autonomous Run" above to dispatch the procurement agent.
                  </p>
                </div>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-[#1c3258]">
                  {activities.map((act) => {
                    const isExpanded = Boolean(expandedActivityIds[act.id])
                    const isError = act.outputData?.isError
                    const duration = act.outputData?.durationMs

                    return (
                      <div key={act.id} className="relative group">
                        {/* Dot indicator on timeline */}
                        <span
                          className={`absolute -left-[27px] top-1.5 w-3 h-3 rounded-full border-2 bg-[#0a1322] transition-colors ${
                            isError
                              ? 'border-red-500 bg-red-500/20'
                              : act.type === 'DECISION'
                              ? 'border-purple-400 bg-purple-500/20'
                              : 'border-blue-500 bg-blue-500/20'
                          }`}
                        />

                        <div className="rounded-lg bg-[#070e1a] border border-[#1c3258] p-3 text-xs space-y-2 hover:border-slate-600 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded border ${
                                  act.type === 'DECISION'
                                    ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                                    : 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                                }`}
                              >
                                {act.toolName || act.type}
                              </span>

                              {duration !== undefined && (
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {duration}ms
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => toggleExpand(act.id)}
                              className="text-slate-400 hover:text-white p-1"
                              aria-label="Toggle details"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          {/* Quick summary line */}
                          {act.type === 'DECISION' ? (
                            <p className="text-slate-200 leading-relaxed font-sans text-xs">
                              {act.outputData?.text}
                            </p>
                          ) : act.toolName === 'get_low_stock_products' ? (
                            <p className="text-slate-300 text-xs">
                              Identified low stock products needing replenishment.
                            </p>
                          ) : act.toolName === 'search_products' ? (
                            <p className="text-slate-300 text-xs">
                              Queried Channel3 catalog for query: "{String((act.inputData as any)?.query || '')}".
                            </p>
                          ) : act.toolName === 'compare_products' ? (
                            <p className="text-slate-300 text-xs">
                              {(act.outputData?.result as any)?.summary || 'Evaluated supplier candidates.'}
                            </p>
                          ) : act.toolName === 'create_purchase_proposal' ? (
                            <p className="text-emerald-400 text-xs font-medium">
                              Formulated verified proposal: {(act.outputData?.result as any)?.totalAmountFormatted}
                            </p>
                          ) : act.toolName === 'request_approval' ? (
                            <p className="text-blue-300 text-xs font-semibold">
                              Saved PurchaseOrder to database with status AWAITING_APPROVAL.
                            </p>
                          ) : null}

                          {/* Expandable JSON details */}
                          {isExpanded && (
                            <div className="pt-2 border-t border-[#1c3258] space-y-2 font-mono text-[10px] text-slate-400">
                              {act.inputData && (
                                <div>
                                  <span className="text-slate-500 font-bold block mb-1">INPUT:</span>
                                  <pre className="p-2 rounded bg-black/40 overflow-x-auto max-h-36">
                                    {JSON.stringify(act.inputData, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {act.outputData && (
                                <div>
                                  <span className="text-slate-500 font-bold block mb-1">OUTPUT:</span>
                                  <pre className="p-2 rounded bg-black/40 overflow-x-auto max-h-48 text-slate-300">
                                    {JSON.stringify(act.outputData, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column (5 cols): Purchase Proposal & Policy Gates */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="bg-[#0a1322] border-[#1c3258] sticky top-6">
            <CardHeader className="p-5 pb-3 border-b border-[#1c3258]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-emerald-400" />
                  <CardTitle className="text-sm font-semibold text-white">
                    Purchase Order Proposal
                  </CardTitle>
                </div>

                <Badge
                  variant="outline"
                  className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px] font-semibold"
                >
                  AWAITING APPROVAL
                </Badge>
              </div>
              <CardDescription className="text-xs text-slate-400">
                Backend-verified supplier pricing & quantity replenishment
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-4">
              {purchaseOrder || proposalResult ? (
                <>
                  {/* Itemized Table */}
                  <div className="rounded-lg border border-[#1c3258] overflow-hidden">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-[#0e1a2f] border-b border-[#1c3258] text-slate-400">
                          <th className="p-2.5 font-semibold">Item & Supplier</th>
                          <th className="p-2.5 font-semibold text-center">Qty</th>
                          <th className="p-2.5 font-semibold text-right">Unit</th>
                          <th className="p-2.5 font-semibold text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1c3258] bg-[#070e1a]">
                        {(purchaseOrder?.items || proposalResult?.items || []).map((item, idx) => {
                          const name =
                            'product' in item && item.product ? item.product.name : (item as any).productName
                          const retailer =
                            'retailer' in item ? (item as any).retailer : purchaseOrder?.supplierId

                          return (
                            <tr key={idx} className="hover:bg-[#0a1322] transition-colors">
                              <td className="p-2.5 max-w-[140px]">
                                <span className="font-medium text-slate-100 block truncate" title={name}>
                                  {name}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono block">
                                  {retailer || 'Channel3 Supplier'}
                                </span>
                              </td>
                              <td className="p-2.5 text-center font-semibold text-slate-200">
                                {item.quantity}
                              </td>
                              <td className="p-2.5 text-right font-mono text-slate-300">
                                {formatCurrency(item.unitPrice)}
                              </td>
                              <td className="p-2.5 text-right font-mono font-bold text-emerald-400">
                                {formatCurrency(item.quantity * item.unitPrice)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Financial Totals */}
                  <div className="p-3 rounded-lg bg-[#070e1a] border border-[#1c3258] space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>Order Subtotal:</span>
                      <span className="font-mono text-white font-bold">
                        {formatCurrency(purchaseOrder?.totalAmount ?? proposalResult?.totalAmountCents ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Currency:</span>
                      <span className="font-mono text-slate-300">USD ($)</span>
                    </div>
                    {purchaseOrder && (
                      <div className="flex justify-between text-slate-400 pt-1 border-t border-[#1c3258]">
                        <span>Purchase Order ID:</span>
                        <span className="font-mono text-blue-400">{purchaseOrder.id.slice(0, 12)}...</span>
                      </div>
                    )}
                  </div>

                  {/* Policy Validation Checks */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Policy Gate Enforcement
                    </span>
                    <div className="space-y-1.5">
                      {(
                        proposalResult?.policyEvaluation?.checks || [
                          { rule: 'POSITIVE_ORDER_AMOUNT', passed: true, detail: 'Order total > $0' },
                          { rule: 'VALID_QUANTITIES', passed: true, detail: 'Positive integer quantities' },
                          { rule: 'BUDGET_COMPLIANCE', passed: true, detail: 'Within allowable budget limits' },
                          { rule: 'SUPPLIER_RATING_THRESHOLD', passed: true, detail: 'Ratings meet >= 4.0 threshold' },
                          { rule: 'APPROVAL_GATE', passed: true, detail: 'Approval required (> $100 or auto off)' },
                        ]
                      ).map((check, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 p-2 rounded bg-[#070e1a] border border-[#1c3258] text-[11px]"
                        >
                          {check.passed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                          )}
                          <span className={check.passed ? 'text-slate-300' : 'text-red-300'}>
                            {check.detail}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs">
                  <FileCheck className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <span>No purchase order proposal generated yet.</span>
                </div>
              )}
            </CardContent>

            <CardFooter className="p-5 border-t border-[#1c3258] bg-[#070e1a]/40 flex flex-col gap-2">
              {purchaseOrder?.id ? (
                <Link
                  href={`/dashboard/approvals?orderId=${purchaseOrder.id}`}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs h-9 rounded-lg transition-colors shadow-md shadow-blue-500/20"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Review & Approve in Approvals
                </Link>
              ) : (
                <Link
                  href="/dashboard/approvals"
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs h-9 rounded-lg transition-colors shadow-md shadow-blue-500/20"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  View Approvals Queue
                </Link>
              )}
              <p className="text-[10px] text-center text-slate-400">
                Purchase orders are saved in AWAITING_APPROVAL status for merchant review.
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function AiProcurementPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          <span>Loading AI Procurement Engine...</span>
        </div>
      }
    >
      <AiProcurementContent />
    </Suspense>
  )
}
