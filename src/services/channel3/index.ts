import { prisma } from '@/lib/prisma'
import {
  RawChannel3Product,
  RawChannel3SearchResponse,
  NormalizedProduct,
  NormalizedOffer,
} from './types'

const CHANNEL3_BASE_URL = 'https://api.trychannel3.com/v1'

export function getChannel3ApiKey(): string {
  const key = process.env.CHANNEL3_API_KEY
  if (!key || key.trim() === '') {
    throw new Error(
      'Channel3 API key is not configured. Please set CHANNEL3_API_KEY in your environment or .env file.'
    )
  }
  return key.trim()
}

/**
 * Normalizes raw Channel3 product data into a consistent internal format.
 * Converts all dollar amounts to integer minor units (cents).
 * Selects the best offer: lowest price in-stock offer, or cheapest overall if none in stock.
 */
export function normalizeChannel3Product(raw: RawChannel3Product): NormalizedProduct {
  const brand = raw.brands && raw.brands.length > 0 ? raw.brands[0].name : undefined

  // Main or first image
  const mainImage = raw.images?.find((img) => img.is_main_image) || raw.images?.[0]
  const imageUrl = mainImage?.cleaned_url || mainImage?.url

  // Normalize all offers
  const rawOffers = raw.offers || []
  const offers: NormalizedOffer[] = rawOffers
    .filter((o) => o && o.price && typeof o.price.price === 'number')
    .map((o) => ({
      retailer: o.domain || 'External Supplier',
      priceCents: Math.round(o.price.price * 100),
      currency: o.price.currency || 'USD',
      availability: o.availability || 'InStock',
      url: o.url,
      condition: o.condition,
    }))

  // Pick best offer (cheapest in-stock, otherwise cheapest available)
  let bestOffer: NormalizedOffer | undefined
  const inStockOffers = offers.filter(
    (o) => o.availability.toLowerCase() === 'instock'
  )

  if (inStockOffers.length > 0) {
    bestOffer = inStockOffers.reduce((best, curr) =>
      curr.priceCents < best.priceCents ? curr : best
    )
  } else if (offers.length > 0) {
    bestOffer = offers.reduce((best, curr) =>
      curr.priceCents < best.priceCents ? curr : best
    )
  }

  return {
    id: raw.id,
    title: raw.title || 'Untitled Product',
    brand,
    imageUrl,
    description: raw.description,
    offers,
    bestOffer,
    rating: raw.ratings?.value,
    ratingCount: raw.ratings?.count,
    sourceUrl: bestOffer?.url || offers[0]?.url,
  }
}

/**
 * Performs a product search against the Channel3 catalog.
 * Handles 401, 402, 429 and network timeouts with informative error messages.
 */
export async function searchProducts(
  query: string,
  limit: number = 8
): Promise<NormalizedProduct[]> {
  const apiKey = getChannel3ApiKey()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch(`${CHANNEL3_BASE_URL}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query: query.trim(),
        limit: Math.max(1, Math.min(limit, 20)),
      }),
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Channel3 authentication failed: invalid or unauthorized API key.')
      }
      if (res.status === 402) {
        throw new Error('Channel3 payment required: monthly API usage quota exceeded.')
      }
      if (res.status === 429) {
        throw new Error('Channel3 rate limit exceeded. Please wait a moment before trying again.')
      }
      const errText = await res.text().catch(() => '')
      throw new Error(`Channel3 search error (${res.status}): ${errText || res.statusText}`)
    }

    const data = (await res.json()) as RawChannel3SearchResponse
    const rawProducts = data.products || []
    return rawProducts.map(normalizeChannel3Product)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Channel3 API request timed out after 15 seconds.')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Retrieves full details for a single canonical product from Channel3.
 */
export async function getProductDetails(id: string): Promise<NormalizedProduct> {
  const apiKey = getChannel3ApiKey()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch(`${CHANNEL3_BASE_URL}/products/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
      },
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Channel3 authentication failed: invalid API key.')
      }
      if (res.status === 404) {
        throw new Error(`Channel3 product with ID "${id}" was not found.`)
      }
      if (res.status === 429) {
        throw new Error('Channel3 rate limit reached. Please retry in a few seconds.')
      }
      const errText = await res.text().catch(() => '')
      throw new Error(`Channel3 product lookup failed (${res.status}): ${errText || res.statusText}`)
    }

    const raw = (await res.json()) as RawChannel3Product
    return normalizeChannel3Product(raw)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Channel3 product details request timed out after 15 seconds.')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Saves or updates a supplier product in the database.
 * Links to internal Product and records supplier price, rating, and availability.
 */
export async function saveSupplierProduct(
  productId: string,
  channel3Product: NormalizedProduct
) {
  const bestOffer = channel3Product.bestOffer
  const price = bestOffer ? bestOffer.priceCents : 0
  const currency = bestOffer?.currency || 'USD'
  const inStock = bestOffer?.availability?.toLowerCase() === 'instock'

  return prisma.supplierProduct.upsert({
    where: {
      id: `${productId}_${channel3Product.id}`,
    },
    update: {
      externalName: channel3Product.title,
      price,
      currency,
      rating: channel3Product.rating ?? 4.5,
      leadTimeDays: 3,
      inStock,
    },
    create: {
      id: `${productId}_${channel3Product.id}`,
      supplierId: channel3Product.id,
      productId,
      externalName: channel3Product.title,
      price,
      currency,
      rating: channel3Product.rating ?? 4.5,
      leadTimeDays: 3,
      inStock,
    },
  })
}

