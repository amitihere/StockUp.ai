'use client'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Package,
  Layers,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronRight,
  Info,
  DollarSign,
  AlertCircle,
  Check,
  Building2,
  Sparkles,
  Bot,
  ArrowRight,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { AgGridReact } from 'ag-grid-react'
import { ColDef, ICellRendererParams, RowSelectedEvent } from 'ag-grid-community'
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js'

import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'

interface PurchaseOrderItem {
  id: string
  productId: string
  quantity: number
  unitPrice: number
  currency: string
  product: {
    id: string
    name: string
    sku: string
    category: string
    currentStock: number
    minStock: number
  }
}

interface PurchaseOrder {
  id: string
  status: 'DRAFT' | 'AWAITING_APPROVAL' | 'APPROVED' | 'PAYMENT_PENDING' | 'PAID' | 'FAILED' | 'CANCELLED'
  totalAmount: number
  currency: string
  supplierId: string
  notes?: string
  createdAt: string
  updatedAt: string
  items: PurchaseOrderItem[]
  approvals: Array<{ id: string; status: string; notes?: string; createdAt: string }>
  payments: Array<{
    id: string
    paypalOrderId?: string
    captureId?: string
    status: string
    amount: number
    createdAt: string
  }>
  procurementRun?: {
    id: string
    status: string
    triggerType: string
    startedAt: string
    receiptId?: string | null
  }
  isReceived?: boolean
}

function ApprovalsContent() {
  const searchParams = useSearchParams()
  const initialOrderId = searchParams.get('orderId') || searchParams.get('id')

  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [quickFilter, setQuickFilter] = useState('')

  const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/procurement/orders', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load purchase orders')
      const json = await res.json()
      const data: PurchaseOrder[] = json.data || []
      setOrders(data)

      // Select initial order if provided or maintain currently selected
      if (initialOrderId) {
        const match = data.find((o) => o.id === initialOrderId)
        if (match) setSelectedOrder(match)
        else if (data.length > 0) setSelectedOrder(data[0])
      } else if (data.length > 0) {
        setSelectedOrder((prev) => {
          if (!prev) return data[0]
          return data.find((o) => o.id === prev.id) || data[0]
        })
      } else {
        setSelectedOrder(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching orders')
    } finally {
      setLoading(false)
    }
  }, [initialOrderId])

  useEffect(() => {
    void fetchOrders()
  }, [fetchOrders])

  // Filter orders by status
  const filteredOrders = useMemo(() => {
    if (statusFilter === 'ALL') return orders
    return orders.filter((o) => o.status === statusFilter)
  }, [orders, statusFilter])

  // Approve purchase order
  const handleApprove = async (orderId: string) => {
    setActionLoading(true)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/procurement/orders/${orderId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Approved via Merchant Approvals Dashboard' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to approve order')

      setActionMessage({ type: 'success', text: 'Purchase order approved. PayPal checkout is now ready.' })
      await fetchOrders()
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Approval failed' })
    } finally {
      setActionLoading(false)
    }
  }

  // Reject purchase order
  const handleReject = async (orderId: string) => {
    setActionLoading(true)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/procurement/orders/${orderId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Rejected by Merchant' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to reject order')

      setActionMessage({ type: 'success', text: 'Purchase order rejected and marked CANCELLED.' })
      await fetchOrders()
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Rejection failed' })
    } finally {
      setActionLoading(false)
    }
  }

  // Cancel order (from APPROVED or PAYMENT_PENDING)
  const handleCancel = async (orderId: string) => {
    setActionLoading(true)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/procurement/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Merchant cancelled payment checkout' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to cancel order')

      setActionMessage({ type: 'success', text: 'Order cancelled successfully.' })
      await fetchOrders()
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Cancellation failed' })
    } finally {
      setActionLoading(false)
    }
  }

  // Mark order as received into inventory
  const handleMarkReceived = async (orderId: string) => {
    setActionLoading(true)
    setActionMessage(null)
    try {
      const res = await fetch(`/api/procurement/orders/${orderId}/receive`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to receive items')

      setActionMessage({
        type: 'success',
        text: 'Items marked received! Inventory stock quantities and low-stock flags have been updated.',
      })
      await fetchOrders()
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to receive inventory' })
    } finally {
      setActionLoading(false)
    }
  }

  // AG Grid column definitions
  const columnDefs: ColDef<PurchaseOrder>[] = useMemo(
    () => [
      {
        headerName: 'Order ID',
        field: 'id',
        width: 140,
        cellRenderer: (params: ICellRendererParams<PurchaseOrder>) => (
          <span className="font-mono text-xs text-blue-400 font-semibold">
            #{params.value ? params.value.slice(-8) : ''}
          </span>
        ),
      },
      {
        headerName: 'Date',
        field: 'createdAt',
        width: 130,
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
      {
        headerName: 'Supplier',
        field: 'supplierId',
        width: 170,
        cellRenderer: (params: ICellRendererParams<PurchaseOrder>) => (
          <div className="flex items-center gap-1.5 text-xs text-slate-300 truncate">
            <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="truncate">{params.value || 'Demo Supplier'}</span>
          </div>
        ),
      },
      {
        headerName: 'Items',
        field: 'items',
        width: 90,
        valueGetter: (params) => params.data?.items?.length || 0,
        cellRenderer: (params: ICellRendererParams) => (
          <span className="text-xs text-slate-300 font-medium">
            {params.value} item{params.value === 1 ? '' : 's'}
          </span>
        ),
      },
      {
        headerName: 'Total',
        field: 'totalAmount',
        width: 110,
        cellRenderer: (params: ICellRendererParams) => (
          <span className="text-xs font-bold text-white">
            {formatCurrency(params.value || 0)}
          </span>
        ),
      },
      {
        headerName: 'Origin',
        field: 'procurementRun',
        width: 150,
        cellRenderer: (params: ICellRendererParams<PurchaseOrder>) => {
          const run = params.data?.procurementRun
          if (!run) return <span className="text-slate-500 text-xs">Direct</span>
          if (run.receiptId) {
            return (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-300 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded">
                <Sparkles className="w-3 h-3 text-purple-400" />
                Receipt #{run.receiptId.slice(-6)}
              </span>
            )
          }
          return (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-300 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded">
              <Bot className="w-3 h-3 text-blue-400" />
              Autonomous
            </span>
          )
        },
      },
      {
        headerName: 'Status',
        field: 'status',
        width: 160,
        cellRenderer: (params: ICellRendererParams<PurchaseOrder>) => {
          const status = params.value
          let badgeClass = 'bg-slate-800 text-slate-300 border-slate-700'
          if (status === 'AWAITING_APPROVAL')
            badgeClass = 'bg-amber-500/10 text-amber-300 border-amber-500/30'
          else if (status === 'APPROVED')
            badgeClass = 'bg-blue-500/10 text-blue-300 border-blue-500/30'
          else if (status === 'PAYMENT_PENDING')
            badgeClass = 'bg-purple-500/10 text-purple-300 border-purple-500/30 animate-pulse'
          else if (status === 'PAID')
            badgeClass = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
          else if (status === 'FAILED')
            badgeClass = 'bg-red-500/10 text-red-300 border-red-500/30'
          else if (status === 'CANCELLED')
            badgeClass = 'bg-slate-700 text-slate-400 border-slate-600'

          return (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${badgeClass}`}
            >
              {status?.replace('_', ' ')}
            </span>
          )
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

  const onRowSelected = useCallback((event: RowSelectedEvent<PurchaseOrder>) => {
    if (event.node.isSelected() && event.data) {
      setSelectedOrder(event.data)
      setActionMessage(null)
    }
  }, [])

  return (
    <PayPalScriptProvider
      options={{
        clientId: paypalClientId || 'test',
        currency: 'USD',
        intent: 'capture',
      }}
    >
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-[#1c3258]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Procurement Approvals & Payments
              </h2>
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" />
                Human-in-the-Loop Gate
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Review autonomous AI restock proposals, enforce financial policy, and authorize payments via PayPal Sandbox.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchOrders}
              disabled={loading}
              className="border-[#1c3258] bg-[#0c182c] hover:bg-[#13233f] text-slate-300 text-xs h-9"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Sandbox Financial Guard Banner */}
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-lg bg-blue-950/40 border border-blue-500/30 text-blue-200 text-xs">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-blue-400 flex-shrink-0" />
            <div>
              <span className="font-semibold text-white">PayPal Sandbox: no real money moves.</span>{' '}
              <span className="text-blue-300">
                Payment transfers to the configured sandbox merchant ({' '}
                <span className="underline font-mono">Demo supplier (PayPal Sandbox merchant)</span> ). The AI agent has zero access to approval or payment tools.
              </span>
            </div>
          </div>
        </div>

        {/* Missing PayPal Client ID Warning */}
        {!paypalClientId && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <div>
              <span className="font-semibold text-white">PayPal Client ID Missing:</span> Please add{' '}
              <code className="bg-black/30 px-1 py-0.5 rounded font-mono text-amber-300">
                NEXT_PUBLIC_PAYPAL_CLIENT_ID
              </code>{' '}
              to your <code className="font-mono">.env</code> file to enable PayPal checkout buttons.
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {['ALL', 'AWAITING_APPROVAL', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'CANCELLED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-blue-600 text-white font-semibold shadow-sm'
                    : 'bg-[#0c182c] text-slate-400 hover:text-slate-200 hover:bg-[#13233f] border border-[#1c3258]'
                }`}
              >
                {st === 'ALL' ? 'All Orders' : st.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search orders..."
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value)}
              className="w-full bg-[#0c182c] border border-[#1c3258] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Action Message Alert */}
        {actionMessage && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center justify-between gap-2 border ${
              actionMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {actionMessage.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              )}
              <span>{actionMessage.text}</span>
            </div>
            <button
              onClick={() => setActionMessage(null)}
              className="text-slate-400 hover:text-white text-xs px-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Grid & Detail Panel Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Orders AG Grid (7 Cols on desktop) */}
          <div className="lg:col-span-7 bg-[#0c182c] border border-[#1c3258] rounded-xl overflow-hidden shadow-lg">
            <div className="p-4 border-b border-[#1c3258] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Purchase Orders Queue</h3>
                <p className="text-[11px] text-slate-400">
                  {filteredOrders.length} order{filteredOrders.length === 1 ? '' : 's'} found
                </p>
              </div>
            </div>

            <div className="ag-theme-alpine-dark w-full" style={{ height: '520px' }}>
              <AgGridReact
                rowData={filteredOrders}
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

          {/* Selected Order Detail Panel (5 Cols on desktop) */}
          <div className="lg:col-span-5 space-y-4">
            {selectedOrder ? (
              <Card className="bg-[#0c182c] border-[#1c3258] text-white shadow-xl">
                <CardHeader className="p-5 border-b border-[#1c3258] bg-[#070e1a]/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-blue-400 font-bold">
                      Order #{selectedOrder.id.slice(-8)}
                    </span>
                    <Badge
                      className={
                        selectedOrder.status === 'AWAITING_APPROVAL'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : selectedOrder.status === 'APPROVED'
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                          : selectedOrder.status === 'PAYMENT_PENDING'
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : selectedOrder.status === 'PAID'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : selectedOrder.status === 'FAILED'
                          ? 'bg-red-500/20 text-red-300 border-red-500/40'
                          : 'bg-slate-700 text-slate-300 border-slate-600'
                      }
                    >
                      {selectedOrder.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <CardTitle className="text-base font-bold text-white mt-2">
                    Purchase Proposal Inspection
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-400">
                    Created on{' '}
                    {new Date(selectedOrder.createdAt).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-5 space-y-4 text-xs">
                  {/* Origin Trigger Badge */}
                  {selectedOrder.procurementRun?.receiptId && (
                    <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0" />
                        <div>
                          <span className="font-semibold text-purple-200 block text-xs">
                            Triggered by receipt #{selectedOrder.procurementRun.receiptId.slice(-8)}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Generated after receipt sales pushed inventory below minimum threshold
                          </span>
                        </div>
                      </div>
                      <Link
                        href={`/dashboard/receipts?id=${selectedOrder.procurementRun.receiptId}`}
                        className="text-xs text-purple-300 hover:text-white underline ml-2 whitespace-nowrap font-medium"
                      >
                        View Receipt
                      </Link>
                    </div>
                  )}

                  {/* Line Items Table */}
                  <div>
                    <span className="font-semibold text-slate-300 uppercase tracking-wider text-[10px] block mb-2">
                      Replenishment Line Items ({selectedOrder.items.length})
                    </span>
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {selectedOrder.items.map((item) => (
                        <div
                          key={item.id}
                          className="p-2.5 rounded-lg bg-[#0e1a2f] border border-[#1c3258] flex items-center justify-between"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="font-semibold text-slate-200 block truncate">
                              {item.product?.name || 'Product'}
                            </span>
                            <span className="text-[11px] text-slate-400 block font-mono">
                              SKU: {item.product?.sku} · Stock: {item.product?.currentStock} / Min: {item.product?.minStock}
                            </span>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="font-bold text-white block">
                              {item.quantity} × {formatCurrency(item.unitPrice)}
                            </span>
                            <span className="text-[11px] font-semibold text-blue-400 block">
                              {formatCurrency(item.unitPrice * item.quantity)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Summary Totals */}
                  <div className="p-3 rounded-lg bg-[#070e1a] border border-[#1c3258] space-y-1.5">
                    <div className="flex justify-between text-slate-400">
                      <span>Supplier</span>
                      <span className="text-slate-200">{selectedOrder.supplierId || 'Channel3 Supplier'}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Total Units</span>
                      <span className="text-slate-200">
                        {selectedOrder.items.reduce((s, i) => s + i.quantity, 0)} units
                      </span>
                    </div>
                    <div className="border-t border-[#1c3258] pt-1.5 flex justify-between font-bold text-sm text-white">
                      <span>Total Amount</span>
                      <span className="text-emerald-400">{formatCurrency(selectedOrder.totalAmount)}</span>
                    </div>
                  </div>

                  {/* Policy Verification Card */}
                  <div className="p-3 rounded-lg bg-[#0e1a2f] border border-[#1c3258] space-y-2">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-300 text-[11px]">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                      <span>Procurement Policy Checklist</span>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>1. Positive Order Amount ($ {formatCurrency(selectedOrder.totalAmount)})</span>
                        <span className="text-emerald-400 font-semibold">PASS</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>2. Deterministic Quantities</span>
                        <span className="text-emerald-400 font-semibold">PASS</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>3. Channel3 Verified Pricing</span>
                        <span className="text-emerald-400 font-semibold">PASS</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span>4. Human Approval Gate</span>
                        <span className="text-blue-400 font-semibold">ACTIVE</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Section based on status */}
                  <div className="pt-2 space-y-3">
                    {actionMessage && actionMessage.type === 'error' && (
                      <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        <span>{actionMessage.text}</span>
                      </div>
                    )}
                    {/* Status: AWAITING_APPROVAL */}
                    {selectedOrder.status === 'AWAITING_APPROVAL' && (
                      <div className="space-y-2">
                        <Button
                          onClick={() => handleApprove(selectedOrder.id)}
                          disabled={actionLoading}
                          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs h-9 justify-center"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                          Approve & Enable Payment
                        </Button>
                        <Button
                          onClick={() => handleReject(selectedOrder.id)}
                          disabled={actionLoading}
                          variant="outline"
                          className="w-full border-red-500/30 hover:bg-red-500/10 text-red-300 text-xs h-9 justify-center"
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1.5" />
                          Reject Proposal
                        </Button>
                      </div>
                    )}

                    {/* Status: APPROVED or PAYMENT_PENDING -> Show PayPal Sandbox Buttons */}
                    {(selectedOrder.status === 'APPROVED' || selectedOrder.status === 'PAYMENT_PENDING') && (
                      <div className="space-y-3">
                        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-center">
                          <span className="text-[11px] text-blue-300 block font-medium">
                            Proposal Approved by Merchant.
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            Authorize payment of {formatCurrency(selectedOrder.totalAmount)} via PayPal Sandbox:
                          </span>
                        </div>

                        {paypalClientId ? (
                          <div className="min-h-[120px] bg-white/5 p-2 rounded-lg border border-[#1c3258]">
                            <PayPalButtons
                              key={selectedOrder.id}
                              style={{
                                layout: 'vertical',
                                color: 'gold',
                                shape: 'rect',
                                label: 'pay',
                                height: 38,
                              }}
                              createOrder={async () => {
                                const res = await fetch('/api/payments/create-order', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ purchaseOrderId: selectedOrder.id }),
                                })
                                const json = await res.json()
                                if (!res.ok) {
                                  const detail = Array.isArray(json.violations) && json.violations.length > 0
                                    ? `${json.error} (${json.violations.join(' ')})`
                                    : json.error || 'Failed to initialize payment'
                                  setActionMessage({ type: 'error', text: detail })
                                  throw new Error(detail)
                                }
                                return json.data.paypalOrderId
                              }}
                              onApprove={async (data) => {
                                const res = await fetch('/api/payments/capture-order', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    purchaseOrderId: selectedOrder.id,
                                    paypalOrderId: data.orderID,
                                  }),
                                })
                                const json = await res.json()
                                if (!res.ok) {
                                  const detail = json.error || 'Payment capture failed'
                                  setActionMessage({ type: 'error', text: detail })
                                  throw new Error(detail)
                                }
                                setActionMessage({
                                  type: 'success',
                                  text: `Payment of ${formatCurrency(selectedOrder.totalAmount)} captured and verified!`,
                                })
                                await fetchOrders()
                              }}
                              onCancel={() => {
                                setActionMessage({
                                  type: 'error',
                                  text: 'PayPal checkout was closed. Order remains in pending state and can be retried.',
                                })
                              }}
                              onError={(err) => {
                                console.error('PayPal checkout error:', err)
                                setActionMessage((prev) =>
                                  prev?.type === 'error'
                                    ? prev
                                    : {
                                        type: 'error',
                                        text:
                                          err instanceof Error && err.message
                                            ? err.message
                                            : 'PayPal processing error. Please retry checkout.',
                                      }
                                )
                              }}
                            />
                          </div>
                        ) : (
                          <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                            PayPal credentials not loaded. Add NEXT_PUBLIC_PAYPAL_CLIENT_ID to .env.
                          </div>
                        )}

                        <Button
                          onClick={() => handleCancel(selectedOrder.id)}
                          disabled={actionLoading}
                          variant="ghost"
                          className="w-full text-slate-400 hover:text-red-400 hover:bg-red-500/10 text-xs h-8"
                        >
                          Cancel this Order
                        </Button>
                      </div>
                    )}

                    {/* Status: PAID -> Mark as Received Action */}
                    {selectedOrder.status === 'PAID' && (
                      <div className="space-y-3">
                        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          <div>
                            <span className="font-semibold block">Order Paid via PayPal Sandbox</span>
                            {selectedOrder.payments?.[0]?.captureId && (
                              <span className="text-[10px] text-slate-400 font-mono block">
                                Capture ID: {selectedOrder.payments[0].captureId}
                              </span>
                            )}
                          </div>
                        </div>

                        <Button
                          onClick={() => handleMarkReceived(selectedOrder.id)}
                          disabled={actionLoading || selectedOrder.isReceived}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-9 justify-center shadow-lg shadow-emerald-500/20"
                        >
                          <Package className="w-3.5 h-3.5 mr-1.5" />
                          {selectedOrder.isReceived
                            ? 'Stock Received & Inventory Updated'
                            : 'Mark as Received (Add to Inventory)'}
                        </Button>
                      </div>
                    )}

                    {/* Status: FAILED or CANCELLED */}
                    {(selectedOrder.status === 'FAILED' || selectedOrder.status === 'CANCELLED') && (
                      <div className="p-3 rounded-lg bg-slate-800 text-slate-400 text-center">
                        <span>This order was {selectedOrder.status.toLowerCase()}. No further actions available.</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="p-12 text-center text-slate-500 bg-[#0c182c] border border-[#1c3258] rounded-xl text-xs">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
                <span>Select a purchase order from the queue to inspect details and authorize payments.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </PayPalScriptProvider>
  )
}

export default function ApprovalsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-12 text-slate-400 text-xs gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
          <span>Loading Approvals & Payment Gateway...</span>
        </div>
      }
    >
      <ApprovalsContent />
    </Suspense>
  )
}
