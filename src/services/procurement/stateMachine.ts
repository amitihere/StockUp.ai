import { PurchaseOrderStatus, Prisma, PurchaseOrder } from '@prisma/client'

/**
 * Strict state transition matrix for StockPilot Purchase Orders.
 *
 * Allowed flows:
 *   AWAITING_APPROVAL -> APPROVED (Merchant signs off)
 *   AWAITING_APPROVAL -> CANCELLED (Merchant rejects proposal)
 *   APPROVED          -> PAYMENT_PENDING (PayPal order created)
 *   APPROVED          -> CANCELLED (Merchant cancels before checkout)
 *   PAYMENT_PENDING   -> PAID (PayPal capture verified & completed)
 *   PAYMENT_PENDING   -> FAILED (PayPal payment declined or verification failed)
 *   PAYMENT_PENDING   -> CANCELLED (Merchant or buyer aborts payment)
 *
 * All other state transitions are strictly disallowed.
 */
export const VALID_TRANSITIONS: Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]> = {
  DRAFT: ['AWAITING_APPROVAL'],
  AWAITING_APPROVAL: ['APPROVED', 'CANCELLED'],
  APPROVED: ['PAYMENT_PENDING', 'CANCELLED'],
  PAYMENT_PENDING: ['PAID', 'FAILED', 'CANCELLED'],
  PAID: [],       // Terminal state for payment flow (inventory mark-received happens on PAID orders)
  FAILED: [],     // Terminal state
  CANCELLED: [],  // Terminal state
}

/**
 * Returns true if moving from `from` to `to` is an allowed transition.
 */
export function canTransition(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  const allowed = VALID_TRANSITIONS[from] || []
  return allowed.includes(to)
}

/**
 * Throws a descriptive error if the transition is invalid.
 */
export function assertCanTransition(from: PurchaseOrderStatus, to: PurchaseOrderStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(
      `Illegal purchase order status transition: cannot move from ${from} to ${to}. Allowed target states: [${(
        VALID_TRANSITIONS[from] || []
      ).join(', ')}]`
    )
  }
}

export type PrismaTransactionClient = Prisma.TransactionClient

export interface TransitionOptions {
  orderId: string
  toStatus: PurchaseOrderStatus
  userId?: string
  action?: string
  reason?: string
  metadata?: Record<string, unknown>
}

/**
 * Executes a purchase order state transition inside a database transaction,
 * recording an immutable AuditLog entry in the same atomic transaction.
 */
export async function transitionPurchaseOrderState(
  tx: PrismaTransactionClient,
  { orderId, toStatus, userId, action, reason, metadata }: TransitionOptions
): Promise<PurchaseOrder> {
  const existing = await tx.purchaseOrder.findUnique({
    where: { id: orderId },
  })

  if (!existing) {
    throw new Error(`Purchase order "${orderId}" not found`)
  }

  assertCanTransition(existing.status, toStatus)

  // Update order status
  const updatedOrder = await tx.purchaseOrder.update({
    where: { id: orderId },
    data: {
      status: toStatus,
    },
  })

  // Record audit log entry
  const resolvedAction = action || `TRANSITION_${toStatus}`
  await tx.auditLog.create({
    data: {
      action: resolvedAction,
      entityType: 'PURCHASE_ORDER',
      entityId: orderId,
      userId: userId || existing.userId,
      details: {
        fromStatus: existing.status,
        toStatus,
        reason: reason || null,
        metadata: (metadata as any) || null,
        totalAmountCents: existing.totalAmount,
      } as any,
    },
  })

  return updatedOrder
}
