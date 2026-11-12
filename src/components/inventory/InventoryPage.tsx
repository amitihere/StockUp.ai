'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, ICellRendererParams, RowClassParams } from 'ag-grid-community'
import {
  Plus,
  Search,
  RefreshCw,
  AlertTriangle,
  Package,
  Pencil,
  Trash2,
  FileDown,
  Sparkles,
  Loader2,
  Clock,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StockStatusBadge } from './StockStatusBadge'
import { ProductDialog } from './ProductDialog'
import { DeleteDialog } from './DeleteDialog'
import { formatCurrency, getStockStatus, isLowStock, isOutOfStock } from '@/lib/utils'
import type { Product, StockStatus } from '@/types'

import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'

export default function InventoryPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quickFilter, setQuickFilter] = useState('')

  // Restock action states
  const [restockingProductId, setRestockingProductId] = useState<string | null>(null)
  const [restockingAll, setRestockingAll] = useState(false)
  const [bannerMessage, setBannerMessage] = useState<{ type: 'info' | 'error'; text: string } | null>(null)

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)

  const gridRef = useRef<AgGridReact<Product>>(null)

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/inventory', { cache: 'no-store' })
      if (!res.ok) {
        const errorJson = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(errorJson.error || `HTTP ${res.status}`)
      }
      const json = (await res.json()) as { data: Product[] }
      setProducts(json.data || [])
    } catch (err) {
      console.error('Error fetching inventory:', err)
      setError(err instanceof Error ? err.message : 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchProducts()
  }, [fetchProducts])

  const handleEdit = useCallback((product: Product) => {
    setSelectedProduct(product)
    setDialogOpen(true)
  }, [])

  const handleDelete = useCallback((product: Product) => {
    setProductToDelete(product)
    setDeleteDialogOpen(true)
  }, [])

  const handleAddNew = () => {
    setSelectedProduct(null)
    setDialogOpen(true)
  }

  const handleRestockProduct = useCallback(
    async (product: Product) => {
      try {
        setRestockingProductId(product.id)
        setBannerMessage(null)
        const res = await fetch('/api/agent/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productIds: [product.id],
          }),
        })
        const json = (await res.json()) as { data?: { runId: string }; error?: string }
        if (!res.ok || !json.data?.runId) {
          throw new Error(json.error || `Failed to launch restock agent (${res.status})`)
        }
        router.push(`/dashboard/ai-procurement?runId=${json.data.runId}`)
      } catch (err) {
        console.error('Error starting restock:', err)
        setBannerMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to launch restock agent',
        })
        setRestockingProductId(null)
      }
    },
    [router]
  )

  const lowStockProducts = useMemo(
    () =>
      products.filter(
        (p) => isLowStock(p.currentStock, p.minStock) || isOutOfStock(p.currentStock)
      ),
    [products]
  )

  const handleRestockAllLowStock = useCallback(async () => {
    const eligibleProducts = lowStockProducts.filter((p) => !p.openOrderId && !p.runningRunId)
    const skippedCount = lowStockProducts.length - eligibleProducts.length

    if (eligibleProducts.length === 0) {
      setBannerMessage({
        type: 'info',
        text: `All ${lowStockProducts.length} low-stock products already have pending orders or active agent runs.`,
      })
      return
    }

    if (skippedCount > 0) {
      setBannerMessage({
        type: 'info',
        text: `Skipped ${skippedCount} product(s) with pending orders or active runs. Starting restock for ${eligibleProducts.length} product(s)...`,
      })
    }

    try {
      setRestockingAll(true)
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productIds: eligibleProducts.map((p) => p.id),
        }),
      })
      const json = (await res.json()) as { data?: { runId: string }; error?: string }
      if (!res.ok || !json.data?.runId) {
        throw new Error(json.error || `Failed to launch restock agent (${res.status})`)
      }
      router.push(`/dashboard/ai-procurement?runId=${json.data.runId}`)
    } catch (err) {
      console.error('Error starting restock all:', err)
      setBannerMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to launch restock agent',
      })
      setRestockingAll(false)
    }
  }, [lowStockProducts, router])

  // Column definitions with strict TypeScript
  const columnDefs = useMemo<ColDef<Product>[]>(() => {
    return [
      {
        headerName: 'Product Name',
        field: 'name',
        flex: 2,
        minWidth: 200,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<Product>) => {
          if (!params.data) return null
          const out = isOutOfStock(params.data.currentStock)
          const low = isLowStock(params.data.currentStock, params.data.minStock)
          return (
            <div className="flex items-center gap-2 h-full">
              {(out || low) && (
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    out ? 'bg-red-400' : 'bg-amber-400'
                  }`}
                />
              )}
              <span className="font-medium text-white truncate">{params.data.name}</span>
            </div>
          )
        },
      },
      {
        headerName: 'SKU',
        field: 'sku',
        flex: 1,
        minWidth: 140,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<Product>) => {
          return (
            <span className="font-mono text-xs text-slate-300 bg-[#0e1a2f] px-2 py-0.5 rounded border border-[#1c3258]">
              {params.value}
            </span>
          )
        },
      },
      {
        headerName: 'Category',
        field: 'category',
        flex: 1,
        minWidth: 120,
        sortable: true,
        filter: true,
        cellRenderer: (params: ICellRendererParams<Product>) => {
          return <span className="text-slate-300 text-xs">{params.value}</span>
        },
      },
      {
        headerName: 'Stock',
        field: 'currentStock',
        width: 100,
        sortable: true,
        filter: 'agNumberColumnFilter',
        cellRenderer: (params: ICellRendererParams<Product>) => {
          if (!params.data) return null
          const out = isOutOfStock(params.data.currentStock)
          const low = isLowStock(params.data.currentStock, params.data.minStock)
          return (
            <span
              className={`font-semibold text-xs ${
                out ? 'text-red-400 font-bold' : low ? 'text-amber-400' : 'text-slate-200'
              }`}
            >
              {params.value} units
            </span>
          )
        },
      },
      {
        headerName: 'Min Stock',
        field: 'minStock',
        width: 110,
        sortable: true,
        filter: 'agNumberColumnFilter',
        cellRenderer: (params: ICellRendererParams<Product>) => {
          return <span className="text-slate-400 text-xs">{params.value} units</span>
        },
      },
      {
        headerName: 'Unit Cost',
        field: 'unitCost',
        width: 110,
        sortable: true,
        filter: 'agNumberColumnFilter',
        cellRenderer: (params: ICellRendererParams<Product>) => {
          return (
            <span className="font-mono text-xs text-emerald-400">
              {formatCurrency(params.value ?? 0)}
            </span>
          )
        },
      },
      {
        headerName: 'Status',
        width: 130,
        sortable: false,
        filter: false,
        cellRenderer: (params: ICellRendererParams<Product>) => {
          if (!params.data) return null
          const status = getStockStatus(params.data.currentStock, params.data.minStock)
          return <StockStatusBadge status={status as StockStatus} />
        },
      },
      {
        headerName: 'Action',
        width: 180,
        sortable: false,
        filter: false,
        cellRenderer: (params: ICellRendererParams<Product>) => {
          if (!params.data) return null
          const prod = params.data
          const isLow =
            isLowStock(prod.currentStock, prod.minStock) || isOutOfStock(prod.currentStock)
          const isCurrentRestocking = restockingProductId === prod.id

          // 1. If product appears in an open purchase order
          if (prod.openOrderId) {
            return (
              <div className="flex items-center h-full">
                <Link
                  href={`/dashboard/approvals?orderId=${prod.openOrderId}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:text-amber-200 hover:bg-amber-500/25 text-[11px] font-medium transition-colors"
                  title="View pending purchase order on Approvals page"
                >
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>Order pending</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </Link>
              </div>
            )
          }

          // 2. If a run for that product is currently RUNNING
          if (prod.runningRunId) {
            return (
              <div className="flex items-center h-full">
                <Link
                  href={`/dashboard/ai-procurement?runId=${prod.runningRunId}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:text-blue-200 hover:bg-blue-500/25 text-[11px] font-medium transition-colors"
                  title="View active agent procurement run"
                >
                  <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                  <span>Agent working...</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                </Link>
              </div>
            )
          }

          // 3. For rows where stock < minStock, show "Restock with AI" button
          if (isLow) {
            return (
              <div className="flex items-center h-full">
                <Button
                  size="sm"
                  onClick={() => void handleRestockProduct(prod)}
                  disabled={isCurrentRestocking || restockingAll}
                  className="h-7 px-2.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium flex items-center gap-1.5 shadow-sm shadow-blue-500/20"
                >
                  {isCurrentRestocking ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Starting...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 text-blue-200" />
                      <span>Restock with AI</span>
                    </>
                  )}
                </Button>
              </div>
            )
          }

          return (
            <div className="flex items-center h-full text-slate-500 text-xs">
              <span>—</span>
            </div>
          )
        },
      },
      {
        headerName: 'Manage',
        width: 85,
        sortable: false,
        filter: false,
        pinned: 'right',
        cellRenderer: (params: ICellRendererParams<Product>) => {
          if (!params.data) return null
          const prod = params.data
          return (
            <div className="flex items-center gap-1.5 h-full">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEdit(prod)}
                className="h-7 w-7 p-0 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10"
                title="Edit Product"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(prod)}
                className="h-7 w-7 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                title="Delete Product"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )
        },
      },
    ]
  }, [handleEdit, handleDelete, handleRestockProduct, restockingProductId, restockingAll])

  // Visual row flagging for products below minimum
  const getRowClass = useCallback((params: RowClassParams<Product>): string => {
    if (!params.data) return ''
    if (isOutOfStock(params.data.currentStock)) {
      return '!bg-red-950/20 !border-l-4 !border-l-red-500'
    }
    if (isLowStock(params.data.currentStock, params.data.minStock)) {
      return '!bg-amber-950/20 !border-l-4 !border-l-amber-500'
    }
    return ''
  }, [])

  const lowStockCount = products.filter(
    (p) => isLowStock(p.currentStock, p.minStock) || isOutOfStock(p.currentStock)
  ).length

  return (
    <div className="space-y-4">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-[#1c3258]">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Inventory Catalog
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Enterprise stock level monitoring, replenishment triggers, and SKU management
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lowStockProducts.length > 0 && (
            <Button
              size="sm"
              onClick={() => void handleRestockAllLowStock()}
              disabled={restockingAll || Boolean(restockingProductId)}
              className="bg-amber-600 hover:bg-amber-500 text-white text-xs h-8 gap-1.5 shadow-sm font-semibold"
            >
              {restockingAll ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Launching restock...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                  <span>Restock all low stock ({lowStockProducts.length})</span>
                </>
              )}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchProducts()}
            disabled={loading}
            className="border-[#1c3258] bg-[#0a1322] text-slate-300 hover:text-white hover:bg-[#13233f] text-xs h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={handleAddNew}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8 gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Product</span>
          </Button>
        </div>
      </div>

      {/* Banner / Info state */}
      {bannerMessage && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between ${
            bannerMessage.type === 'error'
              ? 'bg-red-500/10 border border-red-500/20 text-red-300'
              : 'bg-blue-500/10 border border-blue-500/20 text-blue-300'
          }`}
        >
          <span>{bannerMessage.text}</span>
          <button
            onClick={() => setBannerMessage(null)}
            className="text-slate-400 hover:text-white ml-2 text-sm font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Toolbar: Quick Filter Search & Catalog Status Summary */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0a1322] p-3 rounded-lg border border-[#1c3258]">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Quick search products by name, SKU, or category..."
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value)}
            className="pl-9 bg-[#070e1a] border-[#1c3258] text-white text-xs h-9 focus-visible:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Package className="w-4 h-4 text-blue-400" />
            <span>
              Total: <strong className="text-white">{products.length}</strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <AlertTriangle
              className={`w-4 h-4 ${lowStockCount > 0 ? 'text-amber-400' : 'text-slate-500'}`}
            />
            <span>
              Below Minimum:{' '}
              <strong className={lowStockCount > 0 ? 'text-amber-400' : 'text-white'}>
                {lowStockCount}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* AG Grid Container */}
      <div className="rounded-xl border border-[#1c3258] overflow-hidden bg-[#0a1322] shadow-2xl">
        <div className="ag-theme-alpine-dark w-full" style={{ height: '560px' }}>
          <AgGridReact<Product>
            ref={gridRef}
            rowData={products}
            columnDefs={columnDefs}
            quickFilterText={quickFilter}
            getRowClass={getRowClass}
            pagination={true}
            paginationPageSize={20}
            animateRows={true}
            suppressCellFocus={true}
            defaultColDef={{
              resizable: true,
              sortable: true,
            }}
            overlayLoadingTemplate={
              '<span class="text-xs text-slate-400">Loading catalog...</span>'
            }
            overlayNoRowsTemplate={
              '<span class="text-xs text-slate-400">No products match your criteria.</span>'
            }
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 px-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-red-500/20 border-l-2 border-l-red-500" />
          <span>Out of Stock (Zero Units)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-amber-500/20 border-l-2 border-l-amber-500" />
          <span>Low Stock (Below Configured Minimum)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-[#0a1322] border border-[#1c3258]" />
          <span>Healthy Catalog Stock</span>
        </div>
      </div>

      {/* Add / Edit Dialog */}
      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={selectedProduct}
        onSuccess={() => void fetchProducts()}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        product={productToDelete}
        onSuccess={() => void fetchProducts()}
      />
    </div>
  )
}

