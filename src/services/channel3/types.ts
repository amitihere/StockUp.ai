export interface RawChannel3Image {
  url: string
  cleaned_url?: string | null
  is_main_image?: boolean
  shot_type?: string
  alt_text?: string
}

export interface RawChannel3Brand {
  id: string
  name: string
}

export interface RawChannel3Price {
  price: number
  compare_at_price?: number | null
  currency: string
}

export interface RawChannel3Offer {
  url: string
  domain: string
  price: RawChannel3Price
  availability?: string
  condition?: string
  max_commission_rate?: number
}

export interface RawChannel3Ratings {
  value?: number
  count?: number
  source_count?: number
}

export interface RawChannel3Product {
  id: string
  title: string
  description?: string
  brands?: RawChannel3Brand[]
  images?: RawChannel3Image[]
  category?: {
    slug: string
    title: string
  }
  offers?: RawChannel3Offer[]
  ratings?: RawChannel3Ratings | null
}

export interface RawChannel3SearchResponse {
  products?: RawChannel3Product[]
  next_page_token?: string
}

export interface NormalizedOffer {
  retailer: string
  priceCents: number
  currency: string
  availability: string
  url: string
  condition?: string
}

export interface NormalizedProduct {
  id: string
  title: string
  brand?: string
  imageUrl?: string
  description?: string
  offers: NormalizedOffer[]
  bestOffer?: NormalizedOffer
  rating?: number
  ratingCount?: number
  sourceUrl?: string
}

