import { z } from 'zod'

export const receiptLineSchema = z.object({
  description: z.string().trim().min(1, 'Item description is required'),
  sku: z.string().trim().nullable().optional(),
  quantity: z.coerce.number().int().positive('Quantity must be a positive integer'),
  unitPriceCents: z.coerce.number().int().nonnegative('Unit price must be non-negative integer cents'),
  discountCents: z.coerce.number().int().nonnegative().optional().default(0),
  lineTotalCents: z.coerce.number().int().nonnegative('Line total must be non-negative integer cents'),
})

export const receiptExtractionSchema = z.object({
  merchant: z.string().trim().optional().default('Retail Store'),
  date: z.string().trim().optional().default(() => new Date().toISOString().split('T')[0]),
  currency: z.string().trim().optional().default('USD'),
  lines: z.array(receiptLineSchema).min(1, 'At least one line item is required'),
  totalCents: z.coerce.number().int().nonnegative('Total must be non-negative integer cents'),
})

export type ReceiptLineInput = z.infer<typeof receiptLineSchema>
export type ReceiptExtractionData = z.infer<typeof receiptExtractionSchema>

/**
 * Validates whether the line item totals match the reported total.
 * Allows calculating discrepancy if any.
 */
export function validateReceiptTotals(data: ReceiptExtractionData): {
  totalsMatch: boolean
  lineSumCents: number
  discrepancyCents: number
} {
  const lineSumCents = data.lines.reduce((sum, line) => sum + line.lineTotalCents, 0)
  const discrepancyCents = Math.abs(lineSumCents - data.totalCents)
  const totalsMatch = discrepancyCents === 0
  return { totalsMatch, lineSumCents, discrepancyCents }
}

