'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck,
  DollarSign,
  Star,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { centsToDollars } from '@/lib/utils'
import type { ProcurementPolicy } from '@/types'

interface PolicyFormState {
  monthlyBudgetDollars: string
  maxAutomaticPurchaseDollars: string
  requireApprovalAboveDollars: string
  minimumProductRating: string
  allowAutomaticPurchases: boolean
  currency: string
}

export default function SettingsPage() {
  const [form, setForm] = useState<PolicyFormState>({
    monthlyBudgetDollars: '2000.00',
    maxAutomaticPurchaseDollars: '100.00',
    requireApprovalAboveDollars: '100.00',
    minimumProductRating: '4.0',
    allowAutomaticPurchases: false,
    currency: 'USD',
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const fetchPolicy = useCallback(async () => {
    try {
      setLoading(true)
      setGeneralError(null)
      const res = await fetch('/api/policy', { cache: 'no-store' })
      if (!res.ok) {
        const errorJson = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(errorJson.error || `HTTP ${res.status}`)
      }
      const json = (await res.json()) as { data: ProcurementPolicy }
      const policy = json.data

      setForm({
        monthlyBudgetDollars: centsToDollars(policy.monthlyBudget).toFixed(2),
        maxAutomaticPurchaseDollars: centsToDollars(policy.maxAutomaticPurchase).toFixed(2),
        requireApprovalAboveDollars: centsToDollars(policy.requireApprovalAbove).toFixed(2),
        minimumProductRating: String(policy.minimumProductRating),
        allowAutomaticPurchases: policy.allowAutomaticPurchases,
        currency: policy.currency || 'USD',
      })
    } catch (err) {
      console.error('Error fetching policy:', err)
      setGeneralError(err instanceof Error ? err.message : 'Failed to load policy')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchPolicy()
  }, [fetchPolicy])

  const handleChange = (field: keyof PolicyFormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setSaveSuccess(false)
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
    setSaving(true)
    setGeneralError(null)
    setFieldErrors({})
    setSaveSuccess(false)

    const payload = {
      monthlyBudgetDollars: Number(form.monthlyBudgetDollars),
      maxAutomaticPurchaseDollars: Number(form.maxAutomaticPurchaseDollars),
      requireApprovalAboveDollars: Number(form.requireApprovalAboveDollars),
      minimumProductRating: Number(form.minimumProductRating),
      allowAutomaticPurchases: form.allowAutomaticPurchases,
      currency: form.currency || 'USD',
    }

    try {
      const res = await fetch('/api/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = (await res.json()) as {
        data?: ProcurementPolicy
        error?: string
        errors?: Record<string, string[]>
      }

      if (!res.ok) {
        if (json.errors) {
          setFieldErrors(json.errors)
        }
        setGeneralError(json.error || 'Failed to update policy')
        return
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 4000)
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : 'Network error during save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-[#1c3258]">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Autonomous Procurement Policy
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Define budget ceilings, human approval thresholds, and automated order execution rules
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchPolicy()}
          disabled={loading || saving}
          className="border-[#1c3258] bg-[#0a1322] text-slate-300 hover:text-white hover:bg-[#13233f] text-xs h-8"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Reset to Server
        </Button>
      </div>

      {/* Success Notification */}
      {saveSuccess && (
        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 text-xs text-emerald-300 animate-in fade-in slide-in-from-top-1">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>
            Procurement policy successfully validated and committed to the database. All subsequent agent runs will enforce these rules.
          </span>
        </div>
      )}

      {/* Error Notification */}
      {generalError && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{generalError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Financial & Budget Controls */}
        <Card className="bg-[#0a1322] border-[#1c3258]">
          <CardHeader className="p-5 pb-3 border-b border-[#1c3258]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-white">
                  Budget & Spending Limits
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Strict monetary ceilings for automated and manual restock runs
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5 space-y-4">
            {/* Monthly Budget */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="monthlyBudget" className="text-xs text-slate-300 font-medium">
                  Monthly Procurement Budget (USD)
                </Label>
                <span className="text-[11px] text-slate-500">Stored in cents</span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-semibold">
                  $
                </span>
                <Input
                  id="monthlyBudget"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.monthlyBudgetDollars}
                  onChange={(e) => handleChange('monthlyBudgetDollars', e.target.value)}
                  className="pl-7 bg-[#070e1a] border-[#1c3258] text-white focus-visible:ring-blue-500"
                  required
                />
              </div>
              <p className="text-[11px] text-slate-400">
                The total aggregate expenditure the AI agent is allowed to spend across all purchase orders within a 30-day window.
              </p>
              {fieldErrors.monthlyBudgetDollars && (
                <p className="text-[11px] text-red-400">{fieldErrors.monthlyBudgetDollars[0]}</p>
              )}
            </div>

            {/* Two column: Max Automatic & Require Approval */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="maxAutomaticPurchase" className="text-xs text-slate-300 font-medium">
                  Max Single Automatic Purchase (USD)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-semibold">
                    $
                  </span>
                  <Input
                    id="maxAutomaticPurchase"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.maxAutomaticPurchaseDollars}
                    onChange={(e) => handleChange('maxAutomaticPurchaseDollars', e.target.value)}
                    className="pl-7 bg-[#070e1a] border-[#1c3258] text-white focus-visible:ring-blue-500"
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Maximum dollar value for any single order placed without requiring human confirmation.
                </p>
                {fieldErrors.maxAutomaticPurchaseDollars && (
                  <p className="text-[11px] text-red-400">{fieldErrors.maxAutomaticPurchaseDollars[0]}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="requireApprovalAbove" className="text-xs text-slate-300 font-medium">
                  Require Human Approval Above (USD)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-semibold">
                    $
                  </span>
                  <Input
                    id="requireApprovalAbove"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.requireApprovalAboveDollars}
                    onChange={(e) => handleChange('requireApprovalAboveDollars', e.target.value)}
                    className="pl-7 bg-[#070e1a] border-[#1c3258] text-white focus-visible:ring-blue-500"
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Any purchase proposal exceeding this threshold automatically routes to the Approvals inbox.
                </p>
                {fieldErrors.requireApprovalAboveDollars && (
                  <p className="text-[11px] text-red-400">{fieldErrors.requireApprovalAboveDollars[0]}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Supplier Quality Gates */}
        <Card className="bg-[#0a1322] border-[#1c3258]">
          <CardHeader className="p-5 pb-3 border-b border-[#1c3258]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Star className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-white">
                  Supplier Quality Thresholds
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Minimum rating criteria required when querying the Channel3 supplier network
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5">
            <div className="space-y-1.5 max-w-sm">
              <Label htmlFor="rating" className="text-xs text-slate-300 font-medium">
                Minimum Product & Supplier Rating (0.0 to 5.0)
              </Label>
              <Input
                id="rating"
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={form.minimumProductRating}
                onChange={(e) => handleChange('minimumProductRating', e.target.value)}
                className="bg-[#070e1a] border-[#1c3258] text-white focus-visible:ring-blue-500"
                required
              />
              <p className="text-[11px] text-slate-400">
                Products rated below this score will be automatically filtered out from AI proposals.
              </p>
              {fieldErrors.minimumProductRating && (
                <p className="text-[11px] text-red-400">{fieldErrors.minimumProductRating[0]}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Autonomous Purchase Mode */}
        <Card className="bg-[#0a1322] border-[#1c3258]">
          <CardHeader className="p-5 pb-3 border-b border-[#1c3258]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <Zap className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-white">
                  Autonomous Execution Permission
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Grant permission for the agent to execute PayPal transactions without manual signoff
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5">
            <div className="flex items-center justify-between p-4 rounded-lg bg-[#070e1a] border border-[#1c3258]">
              <div className="space-y-1 pr-4">
                <span className="text-xs font-semibold text-white block">
                  Allow Fully Automatic Purchases
                </span>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  When enabled, the AI agent will directly trigger PayPal Orders API sandbox captures for orders satisfying all budget and approval thresholds. When disabled, every order requires explicit merchant confirmation.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={form.allowAutomaticPurchases}
                onClick={() =>
                  handleChange('allowAutomaticPurchases', !form.allowAutomaticPurchases)
                }
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#0a1322] ${
                  form.allowAutomaticPurchases ? 'bg-blue-600' : 'bg-slate-700'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    form.allowAutomaticPurchases ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </CardContent>

          <CardFooter className="p-5 border-t border-[#1c3258] bg-[#070e1a]/40 flex justify-between items-center">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Zod schema validated on server boundary</span>
            </div>

            <Button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-9 px-6 shadow-sm"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Saving Policy...
                </>
              ) : (
                'Save Procurement Policy'
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}

