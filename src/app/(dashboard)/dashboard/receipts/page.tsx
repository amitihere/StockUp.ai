'use client'

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  ReceiptText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Bot,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Package,
  Layers,
  ArrowRight,
  AlertCircle,
  Check,
  FileText,
  DollarSign,
  TrendingDown,
  Loader2,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils'
import { AgGridReact } from 'ag-grid-react'
import { ColDef, ICellRendererParams, CellValueChangedEvent } from 'ag-grid-community'

import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'

interface InventoryProduct {
  id: string
  name: string
  sku: string
  category: string
  currentStock: number
  minStock: number
}

interface EditableReceiptLine {
  id?: string
  rawName: string
  sku?: string | null
  quantity: number
  unitPrice: number // in cents
  discount: number // in cents
  lineTotal: number // in cents
  matchedProductId: string | null
  confidence?: number
}

interface ReceiptSummary {
  id: string
  merchant: string
  date: string
  status: string
  totalCents: number
  currency: string
  lineItemsCount: number
  matchedItemsCount: number
  hasImage: boolean
  createdAt: string
  procurementRuns?: Array<{ id: string; status: string }>
}

function ReceiptsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialReceiptId = searchParams.get('receiptId') || searchParams.get('id')

  const [receipts, setReceipts] = useState<ReceiptSummary[]>([])
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null)
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [lines, setLines] = useState<EditableReceiptLine[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [launchingRestock, setLaunchingRestock] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [confirmationResult, setConfirmationResult] = useState<{
    lowStockProducts: Array<{
      id: string
      name: string
      sku: string
      currentStock: number
      minStock: number
      deficit: number
    }>
  } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleLaunchRestockAgent = async (productIds: string[], receiptId: string) => {
    try {
      setLaunchingRestock(true)
      setError(null)
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productIds,
          receiptId,
        }),
      })
      const json = (await res.json()) as { data?: { runId: string }; error?: string }
      if (!res.ok || !json.data?.runId) {
        throw new Error(json.error || `Failed to launch restock agent (${res.status})`)
      }
      router.push(`/dashboard/ai-procurement?runId=${json.data.runId}`)
    } catch (err) {
      console.error('Error launching restock agent:', err)
      setError(err instanceof Error ? err.message : 'Failed to launch restock agent')
      setLaunchingRestock(false)
    }
  }

  // Fetch all inventory products for line-item dropdown matching
  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setProducts(json.data || [])
    } catch {
      // ignore
    }
  }, [])

  // Fetch receipts list
  const fetchReceipts = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/receipts', { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load receipts')
      const json = await res.json()
      const data: ReceiptSummary[] = json.data || []
      setReceipts(data)

      if (initialReceiptId) {
        const found = data.find((r) => r.id === initialReceiptId)
        if (found) loadReceiptDetails(found.id)
        else if (data.length > 0) loadReceiptDetails(data[0].id)
      } else if (data.length > 0 && !selectedReceipt) {
        loadReceiptDetails(data[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching receipts')
    } finally {
      setLoading(false)
    }
  }, [initialReceiptId])

  const loadReceiptDetails = async (receiptId: string) => {
    try {
      setError(null)
      setActionSuccess(null)
      setConfirmationResult(null)
      const res = await fetch(`/api/receipts/${receiptId}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load receipt details')
      const json = await res.json()
      const data = json.data
      setSelectedReceipt(data)

      // Initialize editable lines
      setLines(
        data.lineItems.map((item: any) => ({
          id: item.id,
          rawName: item.rawName,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          lineTotal: item.lineTotal || item.unitPrice * item.quantity - item.discount,
          matchedProductId: item.matchedProductId,
          confidence: item.confidence,
        }))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading receipt')
    }
  }

  useEffect(() => {
    void fetchProducts()
    void fetchReceipts()
  }, [fetchProducts, fetchReceipts])

  const handleRetryExtraction = async (receiptId: string) => {
    try {
      setIsExtracting(true)
      setError(null)
      setActionSuccess(null)
      const res = await fetch(`/api/receipts/${receiptId}/extract`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to re-run extraction')
      }
      setActionSuccess('Vision extraction re-run successfully!')
      await fetchReceipts()
      await loadReceiptDetails(receiptId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-extraction failed')
      await fetchReceipts()
      await loadReceiptDetails(receiptId)
    } finally {
      setIsExtracting(false)
    }
  }

  // Handle file drop / upload
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)
    setActionSuccess(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/receipts/upload', {
        method: 'POST',
        body: formData,
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to upload receipt')
      }

      if (json.data?.status === 'EXTRACTION_FAILED') {
        setError(`Vision extraction failed: ${json.data.error || 'Could not parse structured lines'}`)
      } else {
        setActionSuccess('Receipt uploaded and parsed via Vision OCR successfully!')
      }

      await fetchReceipts()
      if (json.data?.receiptId) {
        await loadReceiptDetails(json.data.receiptId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Handle line item cell changes
  const onCellValueChanged = (event: CellValueChangedEvent<EditableReceiptLine>) => {
    const updatedLines = [...lines]
    const index = event.rowIndex
    if (index === null || index === undefined || !updatedLines[index]) return

    const line = { ...updatedLines[index] }
    // Recalculate lineTotal = (qty * unitPrice) - discount
    line.lineTotal = Math.max(0, line.quantity * line.unitPrice - line.discount)
    updatedLines[index] = line
    setLines(updatedLines)
  }

  // Add empty manual line
  const handleAddLine = () => {
    const newLine: EditableReceiptLine = {
      rawName: 'New Item',
      quantity: 1,
      unitPrice: 1000, // $10.00 default
      discount: 0,
      lineTotal: 1000,
      matchedProductId: products[0]?.id || null,
      confidence: 1.0,
    }
    setLines([...lines, newLine])
  }

  // Delete line
  const handleDeleteLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index))
  }

  // Confirm receipt & deduct inventory
  const handleConfirm = async () => {
    if (!selectedReceipt) return
    setConfirming(true)
    setError(null)
    setActionSuccess(null)

    try {
      const payload = {
        merchant: selectedReceipt.merchant,
        date: selectedReceipt.date,
        totalCents: lines.reduce((s, l) => s + l.lineTotal, 0),
        lines: lines.map((l) => ({
          rawName: l.rawName,
          sku: l.sku,
          matchedProductId: l.matchedProductId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount,
          lineTotal: l.lineTotal,
        })),
      }

      const res = await fetch(`/api/receipts/${selectedReceipt.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to confirm receipt')
      }

      setActionSuccess('Receipt confirmed! Inventory stock levels updated and audit logs recorded.')
      setConfirmationResult({
        lowStockProducts: json.data?.lowStockProducts || [],
      })
      await fetchReceipts()
      await loadReceiptDetails(selectedReceipt.id)
      await fetchProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirmation failed')
    } finally {
      setConfirming(false)
    }
  }

  // Calculated totals
  const computedLinesTotal = useMemo(() => {
    return lines.reduce((sum, l) => sum + (l.lineTotal || 0), 0)
  }, [lines])

  const totalsMatch = useMemo(() => {
    if (!selectedReceipt) return true
    return Math.abs(computedLinesTotal - selectedReceipt.totalCents) === 0
  }, [computedLinesTotal, selectedReceipt])

  // AG Grid Column Definitions
  const columnDefs: ColDef<EditableReceiptLine>[] = useMemo(
    () => [
      {
        headerName: 'Item Description',
        field: 'rawName',
        editable: selectedReceipt?.status !== 'CONFIRMED',
        flex: 2,
        minWidth: 160,
      },
      {
        headerName: 'Matched Store Product',
        field: 'matchedProductId',
        editable: selectedReceipt?.status !== 'CONFIRMED',
        flex: 2,
        minWidth: 180,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: {
          values: [null, ...products.map((p) => p.id)],
        },
        valueFormatter: (params) => {
          if (!params.value) return '⚠️ Needs Matching'
          const p = products.find((prod) => prod.id === params.value)
          return p ? `${p.name} (${p.sku})` : params.value
        },
        cellRenderer: (params: ICellRendererParams<EditableReceiptLine>) => {
          if (!params.value) {
            return (
              <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                Needs Matching
              </span>
            )
          }
          const p = products.find((prod) => prod.id === params.value)
          return (
            <span className="text-xs font-medium text-emerald-300 truncate block">
              {p?.name || params.value}
            </span>
          )
        },
      },
      {
        headerName: 'Match Status',
        width: 140,
        sortable: false,
        cellRenderer: (p: ICellRendererParams<EditableReceiptLine>) => {
          if (!p.data) return null
          const isMatched = Boolean(p.data.matchedProductId)
          const conf =
            p.data.confidence !== undefined && p.data.confidence !== null
              ? Math.round(p.data.confidence * 100)
              : null
          return (
            <div className="flex items-center h-full">
              {isMatched ? (
                <span className="text-[11px] font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Matched{conf !== null ? ` (${conf}%)` : ''}</span>
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span>Not matched</span>
                </span>
              )}
            </div>
          )
        },
      },
      {
        headerName: 'Qty',
        field: 'quantity',
        width: 80,
        editable: selectedReceipt?.status !== 'CONFIRMED',
        type: 'numericColumn',
      },
      {
        headerName: 'Unit Price',
        field: 'unitPrice',
        width: 100,
        editable: selectedReceipt?.status !== 'CONFIRMED',
        type: 'numericColumn',
        valueFormatter: (p) => formatCurrency(p.value || 0),
        valueParser: (p) => Math.round(parseFloat(p.newValue || '0') * 100),
      },
      {
        headerName: 'Discount',
        field: 'discount',
        width: 90,
        editable: selectedReceipt?.status !== 'CONFIRMED',
        type: 'numericColumn',
        valueFormatter: (p) => formatCurrency(p.value || 0),
        valueParser: (p) => Math.round(parseFloat(p.newValue || '0') * 100),
      },
      {
        headerName: 'Total',
        field: 'lineTotal',
        width: 100,
        type: 'numericColumn',
        cellRenderer: (p: ICellRendererParams) => (
          <span className="text-xs font-bold text-white">
            {formatCurrency(p.value || 0)}
          </span>
        ),
      },
      {
        headerName: '',
        width: 60,
        cellRenderer: (p: ICellRendererParams) => {
          if (selectedReceipt?.status === 'CONFIRMED') return null
          return (
            <button
              onClick={() => handleDeleteLine(p.node.rowIndex || 0)}
              className="text-slate-500 hover:text-red-400 p-1 transition-colors"
              title="Delete Line"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )
        },
      },
    ],
    [products, selectedReceipt?.status, lines]
  )

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-[#1c3258]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Receipt Intelligence
            </h2>
            <span className="text-[10px] uppercase font-bold tracking-wider text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              Vision OCR & Demand Extraction
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Photograph physical retail sales receipts to extract demand, deduct stock, and trigger autonomous procurement.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUpload}
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs h-9 gap-2 shadow-lg shadow-purple-500/20"
          >
            {uploading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Running Vision OCR...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Sales Receipt</span>
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchReceipts}
            disabled={loading}
            className="border-[#1c3258] bg-[#0c182c] hover:bg-[#13233f] text-slate-300 text-xs h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Untrusted Receipt Text Security Banner */}
      <div className="flex items-center justify-between gap-3 p-3.5 rounded-lg bg-blue-950/40 border border-blue-500/30 text-blue-200 text-xs">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <div>
            <span className="font-semibold text-white">Trust Boundary Safeguard:</span> All receipt OCR text is treated as untrusted user input. Receipt prices inform historical sales demand only and never dictate purchase order costs.
          </div>
        </div>
      </div>

      {/* Action Messages */}
      {error && (
        <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-white px-2">
            Dismiss
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-slate-400 hover:text-white px-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Post-Confirmation Shortage Alert & AI Trigger Panel (Section 2) */}
      {confirmationResult && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/15 to-blue-500/15 border border-amber-500/30 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <TrendingDown className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-white">
                  Inventory Shortages Detected from Sales Receipt
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  {confirmationResult.lowStockProducts.length > 0
                    ? `${confirmationResult.lowStockProducts.length} product(s) have fallen below their minimum stock threshold.`
                    : 'Stock levels updated. All products remain at or above minimum safety thresholds.'}
                </p>
              </div>
            </div>

            {confirmationResult.lowStockProducts.length > 0 && selectedReceipt && (
              <Button
                onClick={() =>
                  void handleLaunchRestockAgent(
                    confirmationResult.lowStockProducts.map((p) => p.id),
                    selectedReceipt.id
                  )
                }
                disabled={launchingRestock}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors shadow-md shadow-blue-500/20 whitespace-nowrap h-auto"
              >
                {launchingRestock ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Launching Restock Agent...</span>
                  </>
                ) : (
                  <>
                    <Bot className="w-4 h-4" />
                    <span>Launch Restock Agent</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </Button>
            )}
          </div>

          {confirmationResult.lowStockProducts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {confirmationResult.lowStockProducts.map((p) => (
                <div
                  key={p.id}
                  className="p-2.5 rounded-lg bg-[#0c182c] border border-amber-500/30 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-semibold text-white block">{p.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Current: {p.currentStock} / Min: {p.minStock}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-red-400">
                    Deficit: -{p.deficit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Split Layout: Receipts Queue vs Detail Review Screen */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (4 cols): Receipts History Queue */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="bg-[#0c182c] border-[#1c3258] text-white">
            <CardHeader className="p-4 border-b border-[#1c3258]">
              <CardTitle className="text-sm font-semibold text-white flex items-center justify-between">
                <span>Receipts Archive</span>
                <span className="text-xs font-normal text-slate-400">
                  {receipts.length} uploaded
                </span>
              </CardTitle>
            </CardHeader>

            <CardContent className="p-2 divide-y divide-[#1c3258] max-h-[560px] overflow-y-auto">
              {receipts.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  <ReceiptText className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
                  <span>No receipts uploaded yet. Upload a photo or sample receipt above.</span>
                </div>
              ) : (
                receipts.map((r) => {
                  const isSelected = selectedReceipt?.id === r.id
                  return (
                    <button
                      key={r.id}
                      onClick={() => loadReceiptDetails(r.id)}
                      className={`w-full text-left p-3 rounded-lg transition-colors flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-blue-600/15 border border-blue-500/40'
                          : 'hover:bg-[#13233f]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-xs text-white truncate">
                            {r.merchant}
                          </span>
                          <span
                            className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border ${
                              r.status === 'CONFIRMED'
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                : r.status === 'EXTRACTED'
                                ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                                : r.status === 'EXTRACTION_FAILED'
                                ? 'bg-red-500/10 text-red-300 border-red-500/30'
                                : r.status === 'EXTRACTING'
                                ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                : 'bg-slate-700 text-slate-300 border-slate-600'
                            }`}
                          >
                            {r.status}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
                          {r.date || new Date(r.createdAt).toLocaleDateString()} · {r.lineItemsCount} items
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-xs font-bold text-white block">
                          {formatCurrency(r.totalCents)}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500 ml-auto mt-0.5" />
                      </div>
                    </button>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column (8 cols): Split Photo & Editable AG Grid */}
        <div className="lg:col-span-8 space-y-4">
          {selectedReceipt ? (
            <Card className="bg-[#0c182c] border-[#1c3258] text-white shadow-xl">
              <CardHeader className="p-4 border-b border-[#1c3258] bg-[#070e1a]/60">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-purple-400 font-bold">
                        Receipt #{selectedReceipt.id.slice(-8)}
                      </span>
                      <Badge
                        className={
                          selectedReceipt.status === 'CONFIRMED'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : selectedReceipt.status === 'EXTRACTED'
                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                            : selectedReceipt.status === 'EXTRACTION_FAILED'
                            ? 'bg-red-500/20 text-red-300 border-red-500/40'
                            : selectedReceipt.status === 'EXTRACTING'
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            : 'bg-slate-700 text-slate-300 border-slate-600'
                        }
                      >
                        {selectedReceipt.status}
                      </Badge>
                    </div>
                    <CardTitle className="text-base font-bold text-white mt-1">
                      {selectedReceipt.merchant || 'Store Receipt'}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-400">
                      <span>
                        Date:{' '}
                        <strong className="text-slate-200">
                          {selectedReceipt.date || 'N/A'}
                        </strong>
                      </span>
                      {selectedReceipt.extractedJson?.invoiceNumber && (
                        <span>
                          Invoice:{' '}
                          <strong className="text-slate-200 font-mono">
                            {selectedReceipt.extractedJson.invoiceNumber}
                          </strong>
                        </span>
                      )}
                      {selectedReceipt.extractedJson?.customer && (
                        <span>
                          Customer:{' '}
                          <strong className="text-slate-200">
                            {selectedReceipt.extractedJson.customer}
                          </strong>
                        </span>
                      )}
                      <span>
                        Currency:{' '}
                        <strong className="text-slate-200">
                          {selectedReceipt.currency || 'USD'}
                        </strong>
                      </span>
                      <span>
                        Uploaded:{' '}
                        {new Date(selectedReceipt.createdAt).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Totals Match Indicator */}
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">Reported Total</span>
                    <span className="text-lg font-bold text-white">
                      {formatCurrency(selectedReceipt.totalCents)}
                    </span>
                    {lines.length === 0 ? (
                      <span className="text-[10px] font-medium text-slate-400 block">
                        ⚪ No lines extracted yet
                      </span>
                    ) : (
                      <span
                        className={`text-[10px] font-semibold block ${
                          totalsMatch ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {totalsMatch
                          ? '✓ Lines Sum Matches Total'
                          : `⚠️ Lines sum: ${formatCurrency(computedLinesTotal)}`}
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-4">
                {/* While Extracting Banner */}
                {(uploading || isExtracting || selectedReceipt.status === 'EXTRACTING') && (
                  <div className="p-3.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-200 text-xs flex items-center gap-2.5">
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
                    <span className="font-medium">
                      Reading receipt with AI... Parsing text, items, and totals.
                    </span>
                  </div>
                )}

                {/* Extraction Failure Banner */}
                {selectedReceipt.status === 'EXTRACTION_FAILED' && (
                  <div className="p-3.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 font-bold text-red-300">
                        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <span>The AI could not read this receipt:</span>
                      </div>
                      <p className="text-slate-300 text-[11px] pl-5">
                        {selectedReceipt.extractedJson?.error ||
                          'Vision OCR could not parse tabular transaction data automatically.'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => void handleRetryExtraction(selectedReceipt.id)}
                      disabled={isExtracting || uploading}
                      className="bg-red-600 hover:bg-red-500 text-white text-xs h-7 gap-1.5 flex-shrink-0 self-start sm:self-auto"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isExtracting ? 'animate-spin' : ''}`} />
                      <span>Retry extraction</span>
                    </Button>
                  </div>
                )}
                {/* Split Photo & Review Section */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  {/* Photo Preview (4 cols on desktop) */}
                  <div className="md:col-span-4 bg-[#070e1a] border border-[#1c3258] rounded-xl p-2 flex flex-col items-center justify-center min-h-[260px]">
                    {selectedReceipt.hasImage ? (
                      <div className="relative w-full h-full flex flex-col items-center">
                        <img
                          src={`/api/receipts/${selectedReceipt.id}/image`}
                          alt="Receipt photo"
                          className="max-h-[300px] w-full object-contain rounded bg-white/5 border border-[#1c3258]"
                        />
                        <a
                          href={`/api/receipts/${selectedReceipt.id}/image`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          <span>Open Full Image</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ) : (
                      <div className="text-center text-slate-500 text-xs p-6">
                        <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <span>No image binary available</span>
                      </div>
                    )}
                  </div>

                  {/* Editable Line Items AG Grid (8 cols on desktop) */}
                  <div className="md:col-span-8 flex flex-col space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200">
                        Extracted Line Items ({lines.length})
                      </span>
                      {selectedReceipt.status !== 'CONFIRMED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleAddLine}
                          className="border-[#1c3258] bg-[#0c182c] hover:bg-[#13233f] text-slate-300 text-xs h-7 gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add Line</span>
                        </Button>
                      )}
                    </div>

                    <div className="ag-theme-alpine-dark w-full" style={{ height: '280px' }}>
                      <AgGridReact
                        rowData={lines}
                        columnDefs={columnDefs}
                        onCellValueChanged={onCellValueChanged}
                        animateRows={true}
                        defaultColDef={{ resizable: true }}
                      />
                    </div>

                    {/* Discount & Bulk Order Insight Card (Optional Item 7) */}
                    {lines.some((l) => (l.discount || 0) > 0) && (
                      <div className="mt-3 p-3.5 rounded-lg bg-purple-950/20 border border-purple-500/20 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-300">
                            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                            <span>Bulk Sale & Promotional Savings Analysis</span>
                          </div>
                          <span className="text-[11px] font-bold text-emerald-400">
                            Customer Savings: -{formatCurrency(lines.reduce((s, l) => s + (l.discount || 0), 0))}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          {lines
                            .filter((l) => (l.discount || 0) > 0)
                            .map((l) => (
                              <div
                                key={l.id}
                                className="p-2 rounded bg-[#070e1a] border border-[#1c3258] flex justify-between items-center"
                              >
                                <div className="min-w-0 pr-2">
                                  <span className="font-medium text-slate-200 block truncate">
                                    {l.rawName}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    Qty: {l.quantity} × {formatCurrency(l.unitPrice)}
                                  </span>
                                </div>
                                <span className="font-semibold text-red-400 flex-shrink-0">
                                  -{formatCurrency(l.discount)}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>

              <CardFooter className="p-4 border-t border-[#1c3258] bg-[#070e1a]/60 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-slate-400">
                  {selectedReceipt.status === 'CONFIRMED' ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      Receipt confirmed. Inventory stock deducted.
                    </span>
                  ) : (
                    <span>
                      Review matched SKUs and quantities before confirming inventory deduction.
                    </span>
                  )}
                </div>

                {selectedReceipt.status !== 'CONFIRMED' && (
                  <Button
                    onClick={handleConfirm}
                    disabled={confirming || lines.length === 0}
                    className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-9 px-6 gap-2 shadow-lg shadow-emerald-500/20"
                  >
                    {confirming ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Deducting Inventory...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Confirm Receipt & Deduct Stock</span>
                      </>
                    )}
                  </Button>
                )}
              </CardFooter>
            </Card>
          ) : (
            <div className="p-16 text-center text-slate-500 bg-[#0c182c] border border-[#1c3258] rounded-xl text-xs">
              <ReceiptText className="w-10 h-10 mx-auto mb-2 opacity-30 text-slate-400" />
              <span>Select a receipt from the archive or upload a new photo to inspect extracted items.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ReceiptsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-12 text-slate-400 text-xs gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
          <span>Loading Receipt Intelligence...</span>
        </div>
      }
    >
      <ReceiptsContent />
    </Suspense>
  )
}
