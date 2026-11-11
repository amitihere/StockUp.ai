import { describe, it, expect } from 'vitest'
import {
  calculateRestockQuantity,
  validatePurchasePolicy,
  trimProposalToBudget,
  PolicyConfig,
  ProposalItemDraft,
} from '../src/services/policy'

describe('calculateRestockQuantity', () => {
  it('restocks out of stock items to target = 2 * minStock', () => {
    // Current: 0, Min: 10 -> Target: 20 -> Quantity: 20
    const qty = calculateRestockQuantity(0, 10)
    expect(qty).toBe(20)
  })

  it('restocks low stock items to target = 2 * minStock', () => {
    // Phone chargers: stock 12, min 20 -> target 40 -> qty 28
    const qty1 = calculateRestockQuantity(12, 20)
    expect(qty1).toBe(28)

    // Wireless keyboards: stock 8, min 15 -> target 30 -> qty 22
    const qty2 = calculateRestockQuantity(8, 15)
    expect(qty2).toBe(22)
  })

  it('restocks at least 1 unit if stock is already at target or higher', () => {
    // Headphones: stock 45, min 20 -> target 40 -> deficit -5 -> minimum 1
    const qty = calculateRestockQuantity(45, 20)
    expect(qty).toBe(1)
  })

  it('handles edge case when minStock is 0', () => {
    const qty = calculateRestockQuantity(0, 0)
    expect(qty).toBe(1)
  })

  it('incorporates sales velocity: target = max(2 * minStock, ceil(avgDailySales * 14))', () => {
    // Current stock: 5, Min stock: 10
    // If avgDailySales = 2.0 -> 14d cover = 28 -> target = max(20, 28) = 28 -> quantity = 28 - 5 = 23
    const qty1 = calculateRestockQuantity(5, 10, 2.0)
    expect(qty1).toBe(23)

    // If avgDailySales = 0.5 -> 14d cover = 7 -> target = max(20, 7) = 20 -> quantity = 20 - 5 = 15
    const qty2 = calculateRestockQuantity(5, 10, 0.5)
    expect(qty2).toBe(15)

    // Out of stock with high sales velocity: stock 0, min 10, avgDailySales 3.2
    // 14d cover = ceil(3.2 * 14) = ceil(44.8) = 45 -> target = max(20, 45) = 45 -> quantity = 45
    const qty3 = calculateRestockQuantity(0, 10, 3.2)
    expect(qty3).toBe(45)
  })
})

describe('validatePurchasePolicy', () => {
  const basePolicy: PolicyConfig = {
    monthlyBudget: 200000, // $2,000 in cents
    maxAutomaticPurchase: 10000, // $100 in cents
    requireApprovalAbove: 10000, // $100 in cents
    minimumProductRating: 4.0,
    allowAutomaticPurchases: false,
  }

  const sampleItems: ProposalItemDraft[] = [
    {
      productId: 'prod-1',
      productName: 'USB-C Cable',
      currentStock: 5,
      minStock: 20,
      quantity: 10,
      unitPrice: 500, // $5.00
      totalPrice: 5000, // $50.00
      reasoning: 'Critical low stock replenishment',
      rating: 4.5,
    },
    {
      productId: 'prod-2',
      productName: 'Phone Charger',
      currentStock: 0,
      minStock: 10,
      quantity: 5,
      unitPrice: 1500, // $15.00
      totalPrice: 7500, // $75.00
      reasoning: 'Out of stock replenishment',
      rating: 4.8,
    },
  ]

  it('passes when order satisfies all policy constraints', () => {
    const result = validatePurchasePolicy(sampleItems, basePolicy, 0, 20000) // $200 owner budget
    expect(result.passed).toBe(true)
    expect(result.totalAmount).toBe(12500) // $125.00
    expect(result.violations).toHaveLength(0)
    expect(result.requiresApproval).toBe(true) // because total $125 > $100 threshold & auto is false
  })

  it('fails when order total is zero or empty', () => {
    const result = validatePurchasePolicy([], basePolicy, 0)
    expect(result.passed).toBe(false)
    expect(result.violations).toContain('Order proposal is empty or total amount is zero.')
  })

  it('fails when an item has invalid or non-integer quantity', () => {
    const badItems: ProposalItemDraft[] = [
      {
        ...sampleItems[0],
        quantity: -2,
        totalPrice: -1000,
      },
    ]
    const result = validatePurchasePolicy(badItems, basePolicy, 0)
    expect(result.passed).toBe(false)
  })

  it('fails when proposal exceeds owner requested budget', () => {
    // Total is $125.00 (12500 cents), owner requested max $100.00 (10000 cents)
    const result = validatePurchasePolicy(sampleItems, basePolicy, 0, 10000)
    expect(result.passed).toBe(false)
    expect(result.violations.some((v) => v.includes('exceeds allowable budget'))).toBe(true)
  })

  it('fails when proposal exceeds remaining monthly budget', () => {
    // Monthly budget is $2000 (200000 cents). Already spent $1950 (195000 cents). Remaining is $50.
    // Order total is $125.
    const result = validatePurchasePolicy(sampleItems, basePolicy, 195000)
    expect(result.passed).toBe(false)
    expect(result.remainingMonthlyBudget).toBe(5000)
  })

  it('fails when a supplier rating is below policy threshold', () => {
    const lowRated: ProposalItemDraft[] = [
      {
        ...sampleItems[0],
        rating: 3.2, // Below 4.0
      },
    ]
    const result = validatePurchasePolicy(lowRated, basePolicy, 0)
    expect(result.passed).toBe(false)
    expect(result.violations.some((v) => v.includes('minimum rating requirement'))).toBe(true)
  })

  it('passes when an item has no rating (rating is optional in Channel3)', () => {
    const unrated: ProposalItemDraft[] = [
      {
        ...sampleItems[0],
        rating: undefined, // Unrated
      },
    ]
    const result = validatePurchasePolicy(unrated, basePolicy, 0, 50000)
    expect(result.passed).toBe(true)
  })

  it('requires approval if allowAutomaticPurchases is false even if under threshold', () => {
    const smallItem: ProposalItemDraft[] = [
      {
        productId: 'prod-1',
        productName: 'Stylus',
        currentStock: 2,
        minStock: 5,
        quantity: 1,
        unitPrice: 2000, // $20.00
        totalPrice: 2000,
        reasoning: 'Stock up',
        rating: 4.5,
      },
    ]
    // Under $100, but allowAutomaticPurchases = false
    const result = validatePurchasePolicy(smallItem, basePolicy, 0)
    expect(result.passed).toBe(true)
    expect(result.requiresApproval).toBe(true)
  })
})

describe('trimProposalToBudget', () => {
  const itemsToTrim: ProposalItemDraft[] = [
    {
      productId: 'p1',
      productName: 'Healthy Item',
      currentStock: 10,
      minStock: 5,
      quantity: 5,
      unitPrice: 2000, // $20
      totalPrice: 10000, // $100
      reasoning: 'Healthy',
    },
    {
      productId: 'p2',
      productName: 'Critical Out of Stock',
      currentStock: 0,
      minStock: 10,
      quantity: 10,
      unitPrice: 2500, // $25
      totalPrice: 25000, // $250
      reasoning: 'Critical',
    },
    {
      productId: 'p3',
      productName: 'Low Stock Deficit',
      currentStock: 2,
      minStock: 8,
      quantity: 6,
      unitPrice: 1500, // $15
      totalPrice: 9000, // $90
      reasoning: 'Low',
    },
  ]

  it('trims proposal so total is within budget and prioritizes out-of-stock items', () => {
    // Total original is $100 + $250 + $90 = $440 (44000 cents)
    // Budget cap: $200 (20000 cents)
    const trimmed = trimProposalToBudget(itemsToTrim, 20000)

    const total = trimmed.reduce((sum, i) => sum + i.totalPrice, 0)
    expect(total).toBeLessThanOrEqual(20000)
    expect(trimmed.length).toBeGreaterThan(0)

    // Critical out of stock item should definitely be retained with priority
    const critical = trimmed.find((i) => i.productId === 'p2')
    expect(critical).toBeDefined()
    expect(critical!.quantity).toBeGreaterThan(0)
  })

  it('returns empty array if budget is 0 or negative', () => {
    const trimmed = trimProposalToBudget(itemsToTrim, 0)
    expect(trimmed).toEqual([])
  })
})

