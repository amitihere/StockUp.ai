import { z } from 'zod'

/**
 * Safely converts numbers (including floating-point dollars like 14.99),
 * formatted currency strings ("$14.99"), and integers into integer minor units (cents).
 */
export function parseCents(val: unknown, fallback: number = 0): number {
  if (val === undefined || val === null || val === '') return fallback
  if (typeof val === 'number') {
    if (isNaN(val)) return fallback
    // If it's a floating point number with decimals, it represents dollars -> convert to cents
    if (!Number.isInteger(val)) {
      return Math.round(val * 100)
    }
    return Math.round(val)
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]/g, '')
    const num = parseFloat(cleaned)
    if (isNaN(num)) return fallback
    if (val.includes('.')) {
      return Math.round(num * 100)
    }
    return Math.round(num)
  }
  return fallback
}

/**
 * Strips markdown code fences or conversational wrappers, extracting the outermost JSON block.
 */
export function cleanJsonOutput(text: string): string {
  let cleaned = text.trim()
  if (cleaned.includes('```')) {
    cleaned = cleaned.replace(/```(?:json)?([\s\S]*?)```/g, '$1').trim()
  }
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1)
  }
  return cleaned
}

export const receiptLineSchema = z.preprocess(
  (val) => {
    if (!val || typeof val !== 'object') return val
    const obj = val as Record<string, unknown>

    const description =
      obj.description || obj.name || obj.item || obj.rawName || 'Item'
    const sku = obj.sku || obj.code || obj.partNumber || null
    const quantity =
      obj.quantity !== undefined
        ? Number(obj.quantity)
        : obj.qty !== undefined
        ? Number(obj.qty)
        : 1

    const rawUnitPrice = obj.unitPriceCents ?? obj.unitPrice ?? obj.price ?? 0
    const rawDiscount = obj.discountCents ?? obj.discount ?? 0
    const rawLineTotal =
      obj.lineTotalCents ?? obj.lineTotal ?? obj.total ?? obj.totalPrice

    const unitPriceCents = parseCents(rawUnitPrice, 0)
    const discountCents = parseCents(rawDiscount, 0)
    let lineTotalCents =
      rawLineTotal !== undefined ? parseCents(rawLineTotal, 0) : undefined

    if (lineTotalCents === undefined && unitPriceCents >= 0 && quantity > 0) {
      lineTotalCents = Math.max(0, quantity * unitPriceCents - discountCents)
    }

    return {
      description: String(description).trim(),
      sku: sku ? String(sku).trim() : null,
      quantity,
      unitPriceCents,
      discountCents,
      lineTotalCents: lineTotalCents ?? 0,
    }
  },
  z.object({
    description: z.string().trim().min(1, 'Item description is required'),
    sku: z.string().trim().nullable().optional(),
    quantity: z.coerce.number().int().positive('Quantity must be a positive integer'),
    unitPriceCents: z.coerce
      .number()
      .int()
      .nonnegative('Unit price must be non-negative integer cents')
      .default(0),
    discountCents: z.coerce.number().int().nonnegative().optional().default(0),
    lineTotalCents: z.coerce
      .number()
      .int()
      .nonnegative('Line total must be non-negative integer cents')
      .default(0),
  })
)

export const receiptExtractionSchema = z.preprocess(
  (val) => {
    if (!val || typeof val !== 'object') return val
    const obj = val as Record<string, unknown>

    const merchant = obj.merchant || obj.store || obj.vendor || 'Store Receipt'
    const date = obj.date || obj.receiptDate || obj.transactionDate || 'N/A'
    const invoiceNumber =
      obj.invoiceNumber ||
      obj.invoiceNo ||
      obj.receiptNumber ||
      obj.receiptNo ||
      obj.orderNumber ||
      null
    const customer = obj.customer || obj.buyer || null
    const currency = (obj.currency || 'USD').toString().toUpperCase()
    const rawLines = Array.isArray(obj.lines)
      ? obj.lines
      : Array.isArray(obj.items)
      ? obj.items
      : []

    let totalCents =
      obj.totalCents !== undefined ||
      obj.total !== undefined ||
      obj.grandTotal !== undefined ||
      obj.amount !== undefined
        ? parseCents(obj.totalCents ?? obj.total ?? obj.grandTotal ?? obj.amount, 0)
        : undefined

    // If totalCents wasn't explicitly given or is 0, compute from lines if lines exist
    if ((totalCents === undefined || totalCents === 0) && rawLines.length > 0) {
      const sum = rawLines.reduce((acc, l: any) => {
        const u = parseCents(l?.unitPriceCents ?? l?.unitPrice ?? l?.price ?? 0)
        const q = Number(l?.quantity ?? l?.qty ?? 1)
        const d = parseCents(l?.discountCents ?? l?.discount ?? 0)
        const t = l?.lineTotalCents ?? l?.lineTotal ?? l?.total
        const lineTot = t !== undefined ? parseCents(t) : Math.max(0, q * u - d)
        return acc + lineTot
      }, 0)
      if (sum > 0) totalCents = sum
    }

    return {
      merchant: String(merchant).trim(),
      date: String(date).trim(),
      invoiceNumber: invoiceNumber ? String(invoiceNumber).trim() : null,
      customer: customer ? String(customer).trim() : null,
      currency,
      lines: rawLines,
      totalCents: totalCents ?? 0,
    }
  },
  z.object({
    merchant: z.string().trim().optional().default('Store Receipt'),
    date: z.string().trim().optional().default('N/A'),
    invoiceNumber: z.string().trim().nullable().optional(),
    customer: z.string().trim().nullable().optional(),
    currency: z.string().trim().optional().default('USD'),
    lines: z.array(receiptLineSchema).default([]),
    totalCents: z.coerce
      .number()
      .int()
      .nonnegative('Total must be non-negative integer cents')
      .default(0),
  })
)

export type ReceiptLineInput = z.infer<typeof receiptLineSchema>
export type ReceiptExtractionData = z.infer<typeof receiptExtractionSchema>

/**
 * Validates whether the line item totals match the reported total.
 * Requires at least 1 line item to be considered a match.
 */
export function validateReceiptTotals(data: ReceiptExtractionData): {
  totalsMatch: boolean
  lineSumCents: number
  discrepancyCents: number
} {
  const lineSumCents = data.lines.reduce((sum, line) => sum + line.lineTotalCents, 0)
  const discrepancyCents = Math.abs(lineSumCents - data.totalCents)
  const totalsMatch = data.lines.length > 0 && discrepancyCents === 0
  return { totalsMatch, lineSumCents, discrepancyCents }
}

/**
 * Parses and validates raw receipt JSON string or object tolerantly.
 */
export function parseReceiptJson(
  input: string | Record<string, unknown>
): ReceiptExtractionData {
  let parsed: unknown = input
  if (typeof input === 'string') {
    const cleaned = cleanJsonOutput(input)
    parsed = JSON.parse(cleaned)
  }
  return receiptExtractionSchema.parse(parsed)
}
