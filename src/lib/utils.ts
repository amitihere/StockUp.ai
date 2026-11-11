import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Shared low-stock logic used across dashboard, AG Grid, and API.
 * Rule: stock < minStock.
 */
export function isLowStock(currentStock: number, minStock: number): boolean {
  return currentStock < minStock
}

export function isOutOfStock(currentStock: number): boolean {
  return currentStock <= 0
}

export type StockStatus = 'healthy' | 'low' | 'out'

export function getStockStatus(currentStock: number, minStock: number): StockStatus {
  if (isOutOfStock(currentStock)) return 'out'
  if (isLowStock(currentStock, minStock)) return 'low'
  return 'healthy'
}

/**
 * Formats integer cents to formatted currency string (e.g. 1299 cents -> "$12.99").
 * Never uses floats for monetary calculations.
 */
export function formatCurrency(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

/**
 * Converts user-facing dollars (e.g. 19.99) to integer cents (1999) on server/client boundary.
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(Number(dollars) * 100)
}

/**
 * Converts integer cents (e.g. 1999) to dollars (19.99) for UI inputs.
 */
export function centsToDollars(cents: number): number {
  return cents / 100
}

