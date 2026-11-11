'use client'

import { useState } from 'react'
import {
  Search,
  ExternalLink,
  Layers,
  Star,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowRight,
  Split,
  Eye,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'
import type { NormalizedProduct } from '@/services/channel3/types'

const SAMPLE_QUERIES = [
  'USB-C charger 20W',
  'Wireless mechanical keyboard',
  'Bluetooth noise cancelling headphones',
  'Braided USB-C cable',
  'Multiport USB-C Hub',
]

export default function ProductDiscoveryPage() {
  const [query, setQuery] = useState('USB-C charger 20W')
  const [results, setResults] = useState<NormalizedProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Selection for comparison (2 to 4 items)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [compareModalOpen, setCompareModalOpen] = useState(false)

  const handleSearch = async (searchQuery?: string) => {
    const q = (searchQuery !== undefined ? searchQuery : query).trim()
    if (!q) return

    setLoading(true)
    setError(null)
    setSearched(true)

    try {
      const res = await fetch('/api/products/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 12 }),
      })

      const json = (await res.json()) as { data?: NormalizedProduct[]; error?: string }

      if (!res.ok) {
        throw new Error(json.error || `Error searching (${res.status})`)
      }

      setResults(json.data || [])
      setSelectedIds([]) // reset selections
    } catch (err) {
      console.error('Search error:', err)
      setError(err instanceof Error ? err.message : 'Failed to search products')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id)
      }
      if (prev.length >= 4) {
        return prev
      }
      return [...prev, id]
    })
  }

  const selectedProducts = results.filter((p) => selectedIds.includes(p.id))

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-[#1c3258]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Product Discovery
            </h2>
            <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Source: Channel3 Network
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Search live wholesale offers across thousands of canonical retailers
          </p>
        </div>

        {selectedIds.length >= 2 && (
          <Button
            size="sm"
            onClick={() => setCompareModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8 gap-1.5 shadow-sm animate-in fade-in"
          >
            <Split className="w-3.5 h-3.5" />
            <span>Compare {selectedIds.length} Products</span>
          </Button>
        )}
      </div>

      {/* Search Bar & Quick Chips */}
      <div className="p-5 rounded-xl bg-[#0a1322] border border-[#1c3258] space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSearch()
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search wholesale products, electronics, chargers, accessories..."
              className="pl-10 bg-[#070e1a] border-[#1c3258] text-white text-sm h-10 focus-visible:ring-blue-500"
            />
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-5 h-10 min-w-[100px] shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Searching...
              </>
            ) : (
              'Search'
            )}
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-400">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Quick Queries:
          </span>
          {SAMPLE_QUERIES.map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => {
                setQuery(sample)
                void handleSearch(sample)
              }}
              className="px-2.5 py-1 rounded-md bg-[#0e1a2f] hover:bg-[#13233f] text-slate-300 text-xs border border-[#1c3258] transition-colors"
            >
              {sample}
            </button>
          ))}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="font-semibold text-red-300">Channel3 Search Error</p>
            <p className="text-red-400/90 mt-0.5">{error}</p>
            {error.includes('API key') && (
              <p className="text-slate-400 mt-2">
                Make sure <code className="text-slate-200 bg-[#0e1a2f] px-1 py-0.5 rounded font-mono">CHANNEL3_API_KEY</code> is set in your <code className="text-slate-200 bg-[#0e1a2f] px-1 py-0.5 rounded font-mono">.env</code> file.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Comparison Drawer / Reminder Banner */}
      {selectedIds.length > 0 && selectedIds.length < 2 && (
        <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Split className="w-4 h-4 text-blue-400" />
            <span>Select at least 1 more product (up to 4) to view side-by-side comparison.</span>
          </div>
          <span className="text-[11px] font-semibold text-blue-400">
            {selectedIds.length}/4 selected
          </span>
        </div>
      )}

      {/* Results Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-72 rounded-xl bg-[#0a1322] border border-[#1c3258] p-4 animate-pulse"
            />
          ))}
        </div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {results.map((product) => {
            const isSelected = selectedIds.includes(product.id)
            const bestOffer = product.bestOffer
            const inStock = bestOffer?.availability?.toLowerCase() === 'instock'

            return (
              <Card
                key={product.id}
                className={`flex flex-col bg-[#0a1322] border transition-all ${
                  isSelected
                    ? 'border-blue-500 ring-1 ring-blue-500/50 shadow-lg shadow-blue-500/10'
                    : 'border-[#1c3258] hover:border-slate-600'
                }`}
              >
                {/* Product Image */}
                <div className="h-44 w-full bg-[#070e1a] border-b border-[#1c3258] relative flex items-center justify-center p-3 overflow-hidden">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.title}
                      className="max-h-full max-w-full object-contain transition-transform duration-200 hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-600">
                      <Layers className="w-8 h-8" />
                      <span className="text-[10px] mt-1">No Image</span>
                    </div>
                  )}

                  {/* Channel3 Tag */}
                  <span className="absolute top-2 left-2 text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-emerald-400 border border-emerald-500/30">
                    Channel3
                  </span>

                  {/* Compare Checkbox */}
                  <button
                    type="button"
                    onClick={() => toggleSelect(product.id)}
                    className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-md border transition-colors ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-400'
                        : 'bg-[#0a1322]/80 backdrop-blur-sm text-slate-300 border-[#1c3258] hover:text-white'
                    }`}
                  >
                    {isSelected ? '✓ Selected' : '+ Compare'}
                  </button>
                </div>

                {/* Content */}
                <CardContent className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    {product.brand && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">
                        {product.brand}
                      </span>
                    )}
                    <h3
                      className="text-xs font-semibold text-white line-clamp-2 leading-tight"
                      title={product.title}
                    >
                      {product.title}
                    </h3>
                  </div>

                  {/* Ratings & Best Offer Info */}
                  <div className="space-y-2 pt-2 border-t border-[#1c3258]">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1 text-amber-400 font-medium">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                        <span>
                          {typeof product.rating === 'number'
                            ? product.rating.toFixed(1)
                            : 'N/A'}
                        </span>
                        {product.ratingCount ? (
                          <span className="text-slate-500 text-[10px]">
                            ({product.ratingCount})
                          </span>
                        ) : null}
                      </div>

                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          inStock
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-red-500/15 text-red-300 border-red-500/30'
                        }`}
                      >
                        {inStock ? 'In Stock' : 'Out of Stock'}
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between">
                      <div>
                        <span className="text-[10px] text-slate-500 block">Best Offer</span>
                        <span className="text-base font-bold text-white tracking-tight">
                          {bestOffer ? formatCurrency(bestOffer.priceCents) : 'Unavailable'}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {bestOffer?.retailer || 'No offer'}
                      </span>
                    </div>
                  </div>
                </CardContent>

                {/* Card Footer: View Offer Link */}
                <CardFooter className="p-3 pt-0 border-t border-[#1c3258] bg-[#070e1a]/40 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">
                    {product.offers.length} offer{product.offers.length === 1 ? '' : 's'}
                  </span>
                  {product.sourceUrl ? (
                    <a
                      href={product.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium transition-colors"
                    >
                      <span>View Offer</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : null}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      ) : searched ? (
        <div className="py-16 text-center rounded-xl bg-[#0a1322] border border-[#1c3258]">
          <Layers className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <h4 className="text-sm font-semibold text-slate-200">No Products Found</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Channel3 did not return any canonical items matching "{query}". Try searching with alternative keywords.
          </p>
        </div>
      ) : null}

      {/* Side-by-Side Comparison Dialog */}
      <Dialog open={compareModalOpen} onOpenChange={setCompareModalOpen}>
        <DialogContent className="max-w-4xl bg-[#0a1322] border-[#1c3258] text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-white text-base flex items-center gap-2">
              <Split className="w-4 h-4 text-blue-400" />
              <span>Channel3 Supplier Comparison</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              Side-by-side evaluation of selected supplier options on pricing, stock availability, and ratings.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-x-auto py-3">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-[#1c3258] bg-[#0e1a2f]">
                  <th className="p-3 text-slate-400 font-semibold w-36">Attribute</th>
                  {selectedProducts.map((p) => (
                    <th key={p.id} className="p-3 text-white font-semibold min-w-[180px]">
                      {p.title.slice(0, 45)}...
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1c3258]">
                <tr>
                  <td className="p-3 font-medium text-slate-400 bg-[#070e1a]">Image</td>
                  {selectedProducts.map((p) => (
                    <td key={p.id} className="p-3">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          alt={p.title}
                          className="w-16 h-16 object-contain rounded bg-[#070e1a] p-1 border border-[#1c3258]"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded bg-[#070e1a] flex items-center justify-center text-slate-600">
                          N/A
                        </div>
                      )}
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className="p-3 font-medium text-slate-400 bg-[#070e1a]">Brand</td>
                  {selectedProducts.map((p) => (
                    <td key={p.id} className="p-3 font-semibold text-slate-200">
                      {p.brand || 'Generic'}
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className="p-3 font-medium text-slate-400 bg-[#070e1a]">Best Price</td>
                  {selectedProducts.map((p) => (
                    <td key={p.id} className="p-3">
                      <span className="text-sm font-bold text-emerald-400 font-mono">
                        {p.bestOffer ? formatCurrency(p.bestOffer.priceCents) : 'N/A'}
                      </span>
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className="p-3 font-medium text-slate-400 bg-[#070e1a]">Retailer</td>
                  {selectedProducts.map((p) => (
                    <td key={p.id} className="p-3 text-slate-300 font-mono">
                      {p.bestOffer?.retailer || 'Unknown'}
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className="p-3 font-medium text-slate-400 bg-[#070e1a]">Availability</td>
                  {selectedProducts.map((p) => {
                    const inStock = p.bestOffer?.availability?.toLowerCase() === 'instock'
                    return (
                      <td key={p.id} className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            inStock
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : 'bg-red-500/15 text-red-300 border-red-500/30'
                          }`}
                        >
                          {inStock ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {p.bestOffer?.availability || 'Unknown'}
                        </span>
                      </td>
                    )
                  })}
                </tr>

                <tr>
                  <td className="p-3 font-medium text-slate-400 bg-[#070e1a]">Rating</td>
                  {selectedProducts.map((p) => (
                    <td key={p.id} className="p-3">
                      <div className="flex items-center gap-1 text-amber-400 font-semibold">
                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                        <span>
                          {typeof p.rating === 'number' ? p.rating.toFixed(2) : 'Unrated'}
                        </span>
                      </div>
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className="p-3 font-medium text-slate-400 bg-[#070e1a]">Direct Link</td>
                  {selectedProducts.map((p) => (
                    <td key={p.id} className="p-3">
                      {p.sourceUrl ? (
                        <a
                          href={p.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                        >
                          <span>Supplier Offer</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        'N/A'
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
