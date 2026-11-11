'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { centsToDollars } from '@/lib/utils'
import type { Product } from '@/types'
import { AlertCircle, Loader2 } from 'lucide-react'

interface ProductDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product | null
  onSuccess: () => void
}

interface FormState {
  name: string
  sku: string
  category: string
  currentStock: string
  minStock: string
  unitCostDollars: string
}

export function ProductDialog({
  open,
  onOpenChange,
  product,
  onSuccess,
}: ProductDialogProps) {
  const isEditing = Boolean(product)

  const [form, setForm] = useState<FormState>({
    name: '',
    sku: '',
    category: '',
    currentStock: '0',
    minStock: '0',
    unitCostDollars: '0.00',
  })

  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Populate form when editing or clear when creating
  useEffect(() => {
    if (product) {
      setForm({
        name: product.name,
        sku: product.sku,
        category: product.category,
        currentStock: String(product.currentStock),
        minStock: String(product.minStock),
        unitCostDollars: (centsToDollars(product.unitCost)).toFixed(2),
      })
    } else {
      setForm({
        name: '',
        sku: '',
        category: '',
        currentStock: '10',
        minStock: '15',
        unitCostDollars: '19.99',
      })
    }
    setFieldErrors({})
    setGeneralError(null)
  }, [product, open])

  const handleChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    // Clear specific field error on change
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setGeneralError(null)
    setFieldErrors({})

    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim().toUpperCase(),
      category: form.category.trim(),
      currentStock: Number(form.currentStock),
      minStock: Number(form.minStock),
      unitCostDollars: Number(form.unitCostDollars),
    }

    try {
      const url = isEditing && product ? `/api/inventory/${product.id}` : '/api/inventory'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = (await res.json()) as {
        data?: Product
        error?: string
        errors?: Record<string, string[]>
      }

      if (!res.ok) {
        if (json.errors) {
          setFieldErrors(json.errors)
        }
        setGeneralError(json.error || 'Failed to save product')
        return
      }

      onSuccess()
      onOpenChange(false)
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : 'Network request failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[#0a1322] border-[#1c3258] text-slate-100">
        <DialogHeader>
          <DialogTitle className="text-white text-lg">
            {isEditing ? 'Edit Product' : 'Add New Product'}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            {isEditing
              ? 'Update catalog specifications, inventory balance, and unit costs.'
              : 'Add a new electronics SKU to your store catalog with replenishment thresholds.'}
          </DialogDescription>
        </DialogHeader>

        {generalError && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2.5 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{generalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Product Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs text-slate-300">
              Product Name *
            </Label>
            <Input
              id="name"
              placeholder="e.g. Phone Charger (USB-C 20W PD)"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="bg-[#070e1a] border-[#1c3258] text-white focus-visible:ring-blue-500"
              required
            />
            {fieldErrors.name && (
              <p className="text-[11px] text-red-400">{fieldErrors.name[0]}</p>
            )}
          </div>

          {/* SKU and Category Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="sku" className="text-xs text-slate-300">
                SKU (Identifier) *
              </Label>
              <Input
                id="sku"
                placeholder="e.g. CHG-USBC-20W"
                value={form.sku}
                onChange={(e) => handleChange('sku', e.target.value.toUpperCase())}
                className="bg-[#070e1a] border-[#1c3258] text-white font-mono uppercase text-xs focus-visible:ring-blue-500"
                required
              />
              {fieldErrors.sku && (
                <p className="text-[11px] text-red-400">{fieldErrors.sku[0]}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="category" className="text-xs text-slate-300">
                Category *
              </Label>
              <Input
                id="category"
                placeholder="e.g. Charging"
                value={form.category}
                onChange={(e) => handleChange('category', e.target.value)}
                className="bg-[#070e1a] border-[#1c3258] text-white focus-visible:ring-blue-500"
                required
              />
              {fieldErrors.category && (
                <p className="text-[11px] text-red-400">{fieldErrors.category[0]}</p>
              )}
            </div>
          </div>

          {/* Current Stock and Min Stock Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentStock" className="text-xs text-slate-300">
                Current Stock (Units) *
              </Label>
              <Input
                id="currentStock"
                type="number"
                min="0"
                step="1"
                value={form.currentStock}
                onChange={(e) => handleChange('currentStock', e.target.value)}
                className="bg-[#070e1a] border-[#1c3258] text-white focus-visible:ring-blue-500"
                required
              />
              {fieldErrors.currentStock && (
                <p className="text-[11px] text-red-400">{fieldErrors.currentStock[0]}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="minStock" className="text-xs text-slate-300">
                Minimum Stock (Threshold) *
              </Label>
              <Input
                id="minStock"
                type="number"
                min="0"
                step="1"
                value={form.minStock}
                onChange={(e) => handleChange('minStock', e.target.value)}
                className="bg-[#070e1a] border-[#1c3258] text-white focus-visible:ring-blue-500"
                required
              />
              {fieldErrors.minStock && (
                <p className="text-[11px] text-red-400">{fieldErrors.minStock[0]}</p>
              )}
            </div>
          </div>

          {/* Unit Cost in Dollars */}
          <div className="space-y-1.5">
            <Label htmlFor="unitCost" className="text-xs text-slate-300">
              Unit Cost (USD $) *
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-semibold">
                $
              </span>
              <Input
                id="unitCost"
                type="number"
                min="0"
                step="0.01"
                placeholder="19.99"
                value={form.unitCostDollars}
                onChange={(e) => handleChange('unitCostDollars', e.target.value)}
                className="pl-7 bg-[#070e1a] border-[#1c3258] text-white focus-visible:ring-blue-500"
                required
              />
            </div>
            <p className="text-[11px] text-slate-400">
              Stored as integer cents ({Math.round(Number(form.unitCostDollars || 0) * 100)} cents)
            </p>
            {fieldErrors.unitCostDollars && (
              <p className="text-[11px] text-red-400">{fieldErrors.unitCostDollars[0]}</p>
            )}
          </div>

          <DialogFooter className="pt-3 border-t border-[#1c3258] gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="border-[#1c3258] text-slate-300 hover:text-white hover:bg-[#13233f]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-500 text-white min-w-[100px]"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : isEditing ? (
                'Save Changes'
              ) : (
                'Add Product'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

