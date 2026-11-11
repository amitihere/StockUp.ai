'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { Product } from '@/types'

interface DeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
  onSuccess: () => void
}

export function DeleteDialog({
  open,
  onOpenChange,
  product,
  onSuccess,
}: DeleteDialogProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!product) return

    setDeleting(true)
    setError(null)

    try {
      const res = await fetch(`/api/inventory/${product.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(json.error || 'Failed to delete product')
      }

      onSuccess()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-[#0a1322] border-[#1c3258] text-slate-100">
        <DialogHeader>
          <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-2">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <DialogTitle className="text-white text-base">
            Delete Product
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400 leading-relaxed">
            Are you sure you want to remove{' '}
            <span className="font-semibold text-slate-200">
              {product?.name}
            </span>{' '}
            (<span className="font-mono text-slate-300">{product?.sku}</span>)?
            This action cannot be undone and will permanently remove this item from your catalog.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300">
            {error}
          </div>
        )}

        <DialogFooter className="gap-2 pt-3 border-t border-[#1c3258]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
            className="border-[#1c3258] text-slate-300 hover:text-white hover:bg-[#13233f]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-600 hover:bg-red-500 text-white min-w-[90px]"
          >
            {deleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete SKU'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

