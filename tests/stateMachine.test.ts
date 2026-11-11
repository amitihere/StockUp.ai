import { describe, it, expect } from 'vitest'
import {
  canTransition,
  assertCanTransition,
  VALID_TRANSITIONS,
} from '@/services/procurement/stateMachine'
import { PurchaseOrderStatus } from '@prisma/client'

describe('Purchase Order State Machine', () => {
  it('allows valid forward progress from AWAITING_APPROVAL to APPROVED', () => {
    expect(canTransition('AWAITING_APPROVAL', 'APPROVED')).toBe(true)
  })

  it('allows rejection from AWAITING_APPROVAL to CANCELLED', () => {
    expect(canTransition('AWAITING_APPROVAL', 'CANCELLED')).toBe(true)
  })

  it('allows progression from APPROVED to PAYMENT_PENDING', () => {
    expect(canTransition('APPROVED', 'PAYMENT_PENDING')).toBe(true)
  })

  it('allows cancellation from APPROVED to CANCELLED', () => {
    expect(canTransition('APPROVED', 'CANCELLED')).toBe(true)
  })

  it('allows completion from PAYMENT_PENDING to PAID', () => {
    expect(canTransition('PAYMENT_PENDING', 'PAID')).toBe(true)
  })

  it('allows failure from PAYMENT_PENDING to FAILED', () => {
    expect(canTransition('PAYMENT_PENDING', 'FAILED')).toBe(true)
  })

  it('allows cancellation from PAYMENT_PENDING to CANCELLED', () => {
    expect(canTransition('PAYMENT_PENDING', 'CANCELLED')).toBe(true)
  })

  it('strictly rejects jumping directly from AWAITING_APPROVAL to PAID', () => {
    expect(canTransition('AWAITING_APPROVAL', 'PAID')).toBe(false)
    expect(() => assertCanTransition('AWAITING_APPROVAL', 'PAID')).toThrow(
      /Illegal purchase order status transition/
    )
  })

  it('strictly rejects jumping from AWAITING_APPROVAL to PAYMENT_PENDING', () => {
    expect(canTransition('AWAITING_APPROVAL', 'PAYMENT_PENDING')).toBe(false)
    expect(() => assertCanTransition('AWAITING_APPROVAL', 'PAYMENT_PENDING')).toThrow()
  })

  it('strictly rejects transitioning out of terminal states (PAID, FAILED, CANCELLED)', () => {
    const allStatuses: PurchaseOrderStatus[] = [
      'DRAFT',
      'AWAITING_APPROVAL',
      'APPROVED',
      'PAYMENT_PENDING',
      'PAID',
      'FAILED',
      'CANCELLED',
    ]

    for (const terminal of ['PAID', 'FAILED', 'CANCELLED'] as PurchaseOrderStatus[]) {
      for (const target of allStatuses) {
        expect(canTransition(terminal, target)).toBe(false)
        expect(() => assertCanTransition(terminal, target)).toThrow()
      }
    }
  })
})

