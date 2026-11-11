import { getAIProvider } from '@/services/ai/factory'
import {
  receiptExtractionSchema,
  validateReceiptTotals,
  ReceiptExtractionData,
} from './schema'
import { matchReceiptLineToProduct, MatchResult } from './matching'
import { Product } from '@prisma/client'

export interface ProcessedReceiptLine {
  description: string
  sku?: string | null
  quantity: number
  unitPriceCents: number
  discountCents: number
  lineTotalCents: number
  matchedProductId: string | null
  confidence: number
  matchedProductName?: string
  matchedProductSku?: string
}

export interface ProcessedReceiptExtraction {
  merchant: string
  date: string
  currency: string
  totalCents: number
  totalsMatch: boolean
  lineSumCents: number
  discrepancyCents: number
  lines: ProcessedReceiptLine[]
  rawExtractedJson: Record<string, unknown>
}

/**
 * Strips markdown code fences or conversational text if present to parse raw JSON.
 */
function cleanJsonOutput(text: string): string {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim()
  }
  return cleaned
}

/**
 * Runs vision extraction on a receipt image buffer with 1 retry on failure.
 */
export async function extractReceiptFromImage(
  imageBuffer: Buffer,
  mimeType: string,
  products: Product[]
): Promise<ProcessedReceiptExtraction> {
  const provider = getAIProvider()

  if (!provider.extractReceiptVision) {
    throw new Error(`AI Provider "${provider.name}" does not support vision extraction`)
  }

  let rawText = ''
  let parsedJson: unknown = null
  let attempts = 0

  while (attempts < 2) {
    attempts++
    try {
      rawText = await provider.extractReceiptVision(imageBuffer, mimeType)
      const cleaned = cleanJsonOutput(rawText)
      parsedJson = JSON.parse(cleaned)
      break
    } catch (err) {
      if (attempts >= 2) {
        throw new Error(
          `Failed to parse receipt vision data into structured JSON: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  // Validate with Zod
  const validated = receiptExtractionSchema.parse(parsedJson)
  const totalsCheck = validateReceiptTotals(validated)

  // Match each line to inventory products
  const processedLines: ProcessedReceiptLine[] = validated.lines.map((line) => {
    const match: MatchResult = matchReceiptLineToProduct(line, products)
    return {
      description: line.description,
      sku: line.sku || null,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      discountCents: line.discountCents || 0,
      lineTotalCents: line.lineTotalCents,
      matchedProductId: match.matchedProductId,
      confidence: match.confidence,
      matchedProductName: match.matchedProductName,
      matchedProductSku: match.matchedProductSku,
    }
  })

  return {
    merchant: validated.merchant,
    date: validated.date,
    currency: validated.currency,
    totalCents: validated.totalCents,
    totalsMatch: totalsCheck.totalsMatch,
    lineSumCents: totalsCheck.lineSumCents,
    discrepancyCents: totalsCheck.discrepancyCents,
    lines: processedLines,
    rawExtractedJson: parsedJson as Record<string, unknown>,
  }
}
