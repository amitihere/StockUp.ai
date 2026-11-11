'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Search,
  RefreshCw,
  ExternalLink,
  Bot,
  Building2,
  Calendar,
  Layers,
  ArrowUpRight,
  FileText,
  Sparkles,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { AgGridReact } from 'ag-grid-react'
import { ColDef, ICellRendererParams, RowSelectedEvent } from 'ag-grid-community'

import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'

interface PaymentRecord {
  id: string
  purchaseOrderId: string
  paypalOrderId?: string
  captureId?: string
  status: 'CREATED' | 'PENDING' | 'COMPLETED' | 'FAILED'
  amount: number
  currency: string
  idempotencyKey: string
  createdAt: string
  updatedAt: string
  purchaseOrder?: {
    id: string
    status: string
    supplierId: string
    totalAmount: number
    notes?: string
    procurementRunId?: string
    procurementRun?: {
      id: string
      triggerType: string
      startedAt: string
      receiptId?: string | null
    }
    items: Array<{
      id: string
      quantity: number
      unitPrice: number
      product: {
        id: string
        name: string
        sku: string
      }
    }>
  }
}

export default function TransactionsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [quickFilter, setQuickFilter] = useState('')

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/payments', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load transaction ledger')
      const json = await res.json()
      const data: PaymentRecord[] = json.data || []
      setPayments(data)

      if (data.length > 0) {
        setSelectedPayment((prev) => {
          if (!prev) return data[0]
          return data.find((p) => p.id === prev.id) || data[0]
        })
      } else {
        setSelectedPayment(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching payments')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchPayments()
  }, [fetchPayments])

  const filteredPayments = useMemo(() => {
    if (statusFilter === 'ALL') return payments
    return payments.filter((p) => p.status === statusFilter)
  }, [payments, statusFilter])

  // Total captured sum
  const totalVolumeCents = useMemo(() => {
    return payments
      .filter((p) => p.status === 'COMPLETED')
      .reduce((sum, p) => sum + p.amount, 0)
  }, [payments])

  const columnDefs: ColDef<PaymentRecord>[] = useMemo(
    () => [
      {
        headerName: 'Purchase ID',
        field: 'purchaseOrderId',
        width: 140,
        cellRenderer: (params: ICellRendererParams<PaymentRecord>) => (
          <span className="font-mono text-xs text-blue-400 font-semibold">
            #{params.value ? params.value.slice(-8) : ''}
          </span>
        ),
      },
      {
        headerName: 'PayPal Order ID',
        field: 'paypalOrderId',
        width: 170,
        cellRenderer: (params: ICellRendererParams) => (
          <span className="font-mono text-xs text-slate-300">
            {params.value || '—'}
          </span>
        ),
      },
      {
        headerName: 'Capture ID',
        field: 'captureId',
        width: 170,
        cellRenderer: (params: ICellRendererParams) => (
          <span className="font-mono text-xs text-emerald-400">
            {params.value || '—'}
          </span>
        ),
      },
      {
        headerName: 'Products',
        width: 220,
        valueGetter: (params) => {
          const items = params.data?.purchaseOrder?.items || []
          if (items.length === 0) return 'No items'
          if (items.length === 1) return `${items[0].product.name} (×${items[0].quantity})`
          return `${items[0].product.name} + ${items.length - 1} more`
        },
        cellRenderer: (params: ICellRendererParams) => (
          <span className="text-xs text-slate-200 truncate block">
            {params.value}
          </span>
        ),
      },
      {
        headerName: 'Amount',
        field: 'amount',
        width: 110,
        cellRenderer: (params: ICellRendererParams) => (
          <span className="text-xs font-bold text-white">
            {formatCurrency(params.value || 0)}
          </span>
        ),
      },
      {
        headerName: 'Payment Status',
        field: 'status',
        width: 150,
        cellRenderer: (params: ICellRendererParams<PaymentRecord>) => {
          const status = params.value
          let badgeClass = 'bg-slate-800 text-slate-300 border-slate-700'
          if (status === 'COMPLETED')
            badgeClass = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
          else if (status === 'CREATED' || status === 'PENDING')
            badgeClass = 'bg-blue-500/10 text-blue-300 border-blue-500/30'
          else if (status === 'FAILED')
            badgeClass = 'bg-red-500/10 text-red-300 border-red-500/30'

          return (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${badgeClass}`}
            >
              {status}
            </span>
          )
        },
      },
      {
        headerName: 'Timestamp',
        field: 'createdAt',
        width: 140,
        valueFormatter: (params) => {
          if (!params.value) return ''
          return new Date(params.value).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        },
      },
    ],
    []
  )

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
    }),
    []
  )

  const onRowSelected = useCallback((event: RowSelectedEvent<PaymentRecord>) => {
    if (event.node.isSelected() && event.data) {
      setSelectedPayment(event.data)
    }
  }, [])

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-[#1c3258]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Transactions & Payment Ledger
            </h2>
            <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded flex items-center gap-1.5">
              <CreditCard className="w-3 h-3" />
              PayPal Sandbox Orders
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Complete audit trail of authorized merchant purchases, capture IDs, and traceability back to AI agent runs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPayments}
            disabled={loading}
            className="border-[#1c3258] bg-[#0c182c] hover:bg-[#13233f] text-slate-300 text-xs h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-[#0c182c] border border-[#1c3258]">
          <span className="text-[11px] text-slate-400 font-medium block">Total Captured Volume</span>
          <span className="text-xl font-bold text-white block mt-1">
            {formatCurrency(totalVolumeCents)}
          </span>
          <span className="text-[10px] text-emerald-400 block mt-0.5">
            {payments.filter((p) => p.status === 'COMPLETED').length} verified captures
          </span>
        </div>

        <div className="p-4 rounded-xl bg-[#0c182c] border border-[#1c3258]">
          <span className="text-[11px] text-slate-400 font-medium block">Payment Transactions</span>
          <span className="text-xl font-bold text-white block mt-1">{payments.length}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Orders processed through sandbox</span>
        </div>

        <div className="p-4 rounded-xl bg-[#0c182c] border border-[#1c3258]">
          <span className="text-[11px] text-slate-400 font-medium block">Environment</span>
          <span className="text-xl font-bold text-blue-400 block mt-1">PayPal Sandbox</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Idempotency-protected v2 API</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {['ALL', 'COMPLETED', 'CREATED', 'FAILED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'bg-[#0c182c] text-slate-400 hover:text-slate-200 hover:bg-[#13233f] border border-[#1c3258]'
              }`}
            >
              {st === 'ALL' ? 'All Transactions' : st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search payments..."
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value)}
            className="w-full bg-[#0c182c] border border-[#1c3258] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Main Grid & Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* AG Grid Table (7 Cols) */}
        <div className="lg:col-span-7 bg-[#0c182c] border border-[#1c3258] rounded-xl overflow-hidden shadow-lg">
          <div className="p-4 border-b border-[#1c3258]">
            <h3 className="text-sm font-semibold text-white">Payment Ledger</h3>
            <p className="text-[11px] text-slate-400">
              {filteredPayments.length} transaction record{filteredPayments.length === 1 ? '' : 's'}
            </p>
          </div>

          <div className="ag-theme-alpine-dark w-full" style={{ height: '520px' }}>
            <AgGridReact
              rowData={filteredPayments}
              columnDefs={columnDefs}
              defaultColDef={defaultColDef}
              rowSelection="single"
              onRowSelected={onRowSelected}
              quickFilterText={quickFilter}
              animateRows={true}
              pagination={true}
              paginationPageSize={10}
            />
          </div>
        </div>

        {/* Selected Payment Detail View (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {selectedPayment ? (
            <Card className="bg-[#0c182c] border-[#1c3258] text-white shadow-xl">
              <CardHeader className="p-5 border-b border-[#1c3258] bg-[#070e1a]/60">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-blue-400 font-bold">
                    Payment #{selectedPayment.id.slice(-8)}
                  </span>
                  <Badge
                    className={
                      selectedPayment.status === 'COMPLETED'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : selectedPayment.status === 'FAILED'
                        ? 'bg-red-500/20 text-red-300 border-red-500/40'
                        : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                    }
                  >
                    {selectedPayment.status}
                  </Badge>
                </div>
                <CardTitle className="text-base font-bold text-white mt-2">
                  Transaction & Traceability Audit
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Recorded on{' '}
                  {new Date(selectedPayment.createdAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </CardDescription>
              </CardHeader>

              <CardContent className="p-5 space-y-4 text-xs">
                {/* Financial Identifier Details */}
                <div className="p-3 rounded-lg bg-[#070e1a] border border-[#1c3258] space-y-2">
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Purchase Order ID</span>
                    <span className="font-mono text-slate-200">
                      {selectedPayment.purchaseOrderId}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>PayPal Order ID</span>
                    <span className="font-mono text-blue-300">
                      {selectedPayment.paypalOrderId || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>PayPal Capture ID</span>
                    <span className="font-mono text-emerald-400">
                      {selectedPayment.captureId || 'N/A'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400">
                    <span>Idempotency Key</span>
                    <span className="font-mono text-[10px] text-slate-400 truncate max-w-[180px]">
                      {selectedPayment.idempotencyKey}
                    </span>
                  </div>
                  <div className="border-t border-[#1c3258] pt-2 flex justify-between font-bold text-sm text-white">
                    <span>Amount Captured</span>
                    <span className="text-emerald-400">
                      {formatCurrency(selectedPayment.amount)} {selectedPayment.currency}
                    </span>
                  </div>
                </div>

                {/* Purchased Products */}
                {selectedPayment.purchaseOrder?.items && (
                  <div>
                    <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px] block mb-2">
                      Purchased Products ({selectedPayment.purchaseOrder.items.length})
                    </span>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {selectedPayment.purchaseOrder.items.map((item) => (
                        <div
                          key={item.id}
                          className="p-2 rounded bg-[#0e1a2f] border border-[#1c3258] flex justify-between items-center text-slate-300"
                        >
                          <span className="truncate pr-2">{item.product.name}</span>
                          <span className="font-mono text-slate-400 flex-shrink-0">
                            {item.quantity} × {formatCurrency(item.unitPrice)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Traceability: Link to AI Procurement Run */}
                {selectedPayment.purchaseOrder?.procurementRunId && (
                  <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <div>
                        <span className="font-semibold text-slate-200 block text-[11px]">
                          Autonomous Origin Run
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono block">
                          Run ID #{selectedPayment.purchaseOrder.procurementRunId.slice(-8)}
                        </span>
                      </div>
                    </div>
                    <Link
                      href={`/dashboard/ai-procurement?runId=${selectedPayment.purchaseOrder.procurementRunId}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-medium"
                    >
                      <span>View Run</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}

                {/* Traceability: Triggered by Sales Receipt */}
                {selectedPayment.purchaseOrder?.procurementRun?.receiptId && (
                  <div className="p-3 rounded-lg bg-purple-950/30 border border-purple-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0" />
                      <div>
                        <span className="font-semibold text-slate-200 block text-[11px]">
                          Triggered by receipt #{selectedPayment.purchaseOrder.procurementRun.receiptId.slice(-8)}
                        </span>
                        <span className="text-[10px] text-purple-300/80">
                          Automated restock order
                        </span>
                      </div>
                    </div>
                    <Link
                      href={`/dashboard/receipts?id=${selectedPayment.purchaseOrder.procurementRun.receiptId}`}
                      className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 font-medium"
                    >
                      <span>View Receipt</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                )}

                {/* Link to Approvals */}
                <div className="pt-2">
                  <Link
                    href={`/dashboard/approvals?orderId=${selectedPayment.purchaseOrderId}`}
                    className="w-full flex items-center justify-center gap-2 bg-[#13233f] hover:bg-[#1a2f55] border border-[#1c3258] text-slate-200 text-xs h-9 rounded-lg font-medium transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Inspect Purchase Order in Approvals
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="p-12 text-center text-slate-500 bg-[#0c182c] border border-[#1c3258] rounded-xl text-xs">
              <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
              <span>Select a transaction from the ledger to inspect PayPal capture IDs and origin agent runs.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
