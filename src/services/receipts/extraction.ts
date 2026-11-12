import { getAIProvider } from '@/services/ai/factory'
import { OpenAIProvider } from '@/services/ai/openai'
import {
  receiptExtractionSchema,
  validateReceiptTotals,
  cleanJsonOutput,
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
  invoiceNumber?: string | null
  customer?: string | null
  currency: string
  totalCents: number
  totalsMatch: boolean
  lineSumCents: number
  discrepancyCents: number
  lines: ProcessedReceiptLine[]
  rawExtractedJson: Record<string, unknown>
}

export { cleanJsonOutput }

/**
 * Runs vision extraction on a receipt image buffer with 1 retry on failure
 * and optional OpenAI vision adapter fallback.
 */
export async function extractReceiptFromImage(
  imageBuffer: Buffer,
  mimeType: string,
  products: Product[]
): Promise<ProcessedReceiptExtraction> {
  const primaryProvider = getAIProvider()

  let rawText = ''
  let parsedJson: unknown = null
  let lastError: Error | null = null
  let activeProviderName = primaryProvider.name
  let activeModelName =
    primaryProvider.name === 'gemini'
      ? (primaryProvider as any).getVisionModelName?.() || 'gemini-3.6-flash'
      : (primaryProvider as any).getModelName?.() || 'gpt-4o'

  // Attempt 1 & 2: Primary provider
  if (primaryProvider.extractReceiptVision) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        rawText = await primaryProvider.extractReceiptVision(imageBuffer, mimeType)
        const cleaned = cleanJsonOutput(rawText)
        parsedJson = JSON.parse(cleaned)
        lastError = null
        break
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        console.warn(
          `[Receipt Extraction] ${activeProviderName} (${activeModelName}) attempt ${attempt} failed: ${lastError.message}`
        )
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000))
        }
      }
    }
  } else {
    lastError = new Error(
      `AI Provider "${primaryProvider.name}" does not support vision extraction`
    )
  }

  // Fallback to OpenAI vision adapter if primary failed and OPENAI_API_KEY exists
  if ((!parsedJson || lastError) && process.env.OPENAI_API_KEY && primaryProvider.name !== 'openai') {
    console.log('[Receipt Extraction] Primary provider failed. Attempting OpenAI vision adapter fallback...')
    try {
      const openAiProvider = new OpenAIProvider()
      activeProviderName = 'openai'
      activeModelName = 'gpt-4o'
      rawText = await openAiProvider.extractReceiptVision(imageBuffer, mimeType)
      const cleaned = cleanJsonOutput(rawText)
      parsedJson = JSON.parse(cleaned)
      lastError = null
      console.log('[Receipt Extraction] OpenAI vision fallback succeeded.')
    } catch (openAiErr) {
      console.error('[Receipt Extraction] OpenAI vision adapter fallback also failed:', openAiErr)
      lastError = openAiErr instanceof Error ? openAiErr : new Error(String(openAiErr))
    }
  }

  // If extraction or JSON parsing failed completely, log REAL failure details and throw
  if (!parsedJson || lastError) {
    const status = (lastError as any)?.status || (lastError as any)?.statusCode || 500
    const failureLog = {
      provider: activeProviderName,
      model: activeModelName,
      httpStatus: status,
      errorMessage: lastError?.message || 'Failed to parse receipt vision data into structured JSON',
      rawReplyPreview: rawText ? rawText.slice(0, 500) : '<empty>',
    }
    console.error('[Receipt Extraction REAL Failure]:', JSON.stringify(failureLog, null, 2))
    throw new Error(
      `Receipt extraction failed (${failureLog.provider}/${failureLog.model}, HTTP ${failureLog.httpStatus}): ${failureLog.errorMessage}`
    )
  }

  // Validate with tolerant Zod schema
  const validated: ReceiptExtractionData = receiptExtractionSchema.parse(parsedJson)
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
    merchant: validated.merchant || 'Store Receipt',
    date: validated.date || 'N/A',
    invoiceNumber: validated.invoiceNumber,
    customer: validated.customer,
    currency: validated.currency || 'USD',
    totalCents: validated.totalCents,
    totalsMatch: totalsCheck.totalsMatch,
    lineSumCents: totalsCheck.lineSumCents,
    discrepancyCents: totalsCheck.discrepancyCents,
    lines: processedLines,
    rawExtractedJson: parsedJson as Record<string, unknown>,
  }
}
