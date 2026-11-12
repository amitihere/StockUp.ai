export type StockStatus = 'healthy' | 'low' | 'out'

export interface Product {
  id: string
  name: string
  sku: string
  category: string
  currentStock: number
  minStock: number
  unitCost: number // stored in cents
  currency: string
  createdAt: string | Date
  updatedAt: string | Date
  userId: string
  openOrderId?: string | null
  runningRunId?: string | null
}

export interface ProcurementPolicy {
  id: string
  monthlyBudget: number // cents
  maxAutomaticPurchase: number // cents
  requireApprovalAbove: number // cents
  minimumProductRating: number // e.g. 4.0
  allowAutomaticPurchases: boolean
  currency: string
  userId: string
  createdAt: string | Date
  updatedAt: string | Date
}

export interface OverviewStats {
  totalInventoryValue: number // cents
  totalProducts: number
  lowStockCount: number
  monthlyProcurementSpend: number // cents
  pendingApprovals: number
  completedPurchases: number
}

export interface ApiSuccessResponse<T> {
  data: T
  message?: string
}

export interface ApiErrorResponse {
  error: string
  errors?: Record<string, string[]>
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

export const DEMO_USER_EMAIL = 'demo@stockpilot.ai'

