import { Product } from '@prisma/client'

export interface MatchResult {
  matchedProductId: string | null
  confidence: number
  matchedProductName?: string
  matchedProductSku?: string
}

/**
 * Normalizes text for matching by converting to lower case and stripping punctuation.
 */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Computes token-based Jaccard similarity between two strings (0.0 to 1.0).
 */
function tokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalize(a).split(' ').filter(Boolean))
  const tokensB = new Set(normalize(b).split(' ').filter(Boolean))

  if (tokensA.size === 0 || tokensB.size === 0) return 0

  let intersection = 0
  tokensA.forEach((token) => {
    if (tokensB.has(token)) {
      intersection++
    }
  })

  const union = new Set([...tokensA, ...tokensB]).size
  return union > 0 ? intersection / union : 0
}

/**
 * Matches a receipt line item to store inventory products.
 * 1. Checks exact SKU match -> confidence 1.0
 * 2. Checks token similarity against product name and category -> confidence score
 * 3. Threshold: if best match score >= 0.5, returns matched product; otherwise returns null (needs matching)
 */
export function matchReceiptLineToProduct(
  line: { description: string; sku?: string | null },
  products: Product[]
): MatchResult {
  // 1. Exact SKU match
  if (line.sku && line.sku.trim()) {
    const cleanSku = line.sku.trim().toLowerCase()
    const skuMatch = products.find((p) => p.sku.toLowerCase() === cleanSku)
    if (skuMatch) {
      return {
        matchedProductId: skuMatch.id,
        confidence: 1.0,
        matchedProductName: skuMatch.name,
        matchedProductSku: skuMatch.sku,
      }
    }
  }

  // Also check if description contains an exact SKU
  for (const p of products) {
    if (line.description.toLowerCase().includes(p.sku.toLowerCase())) {
      return {
        matchedProductId: p.id,
        confidence: 0.95,
        matchedProductName: p.name,
        matchedProductSku: p.sku,
      }
    }
  }

  // 2. Name similarity
  let bestScore = 0
  let bestProduct: Product | null = null

  for (const p of products) {
    // Check direct name similarity
    const score = tokenSimilarity(line.description, p.name)

    // Check if one contains the other
    const normDesc = normalize(line.description)
    const normName = normalize(p.name)
    let bonus = 0

    if (normName.includes(normDesc) || normDesc.includes(normName)) {
      bonus = 0.3
    }

    const finalScore = Math.min(1.0, score + bonus)

    if (finalScore > bestScore) {
      bestScore = finalScore
      bestProduct = p
    }
  }

  // Confidence threshold: at least 0.45 to match
  if (bestProduct && bestScore >= 0.45) {
    return {
      matchedProductId: bestProduct.id,
      confidence: Math.round(bestScore * 100) / 100,
      matchedProductName: bestProduct.name,
      matchedProductSku: bestProduct.sku,
    }
  }

  // Unmatched -> Needs matching
  return {
    matchedProductId: null,
    confidence: Math.round(bestScore * 100) / 100,
  }
}
