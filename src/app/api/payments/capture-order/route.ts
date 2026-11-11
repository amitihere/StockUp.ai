import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDemoUser } from '@/services/inventory'
import {
  getPayPalOrder,
  capturePayPalOrder,
  centsToString,
} from '@/services/paypal'
import { transitionPurchaseOrderState } from '@/services/procurement/stateMachine'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const captureOrderSchema = z.object({
  purchaseOrderId: z.string().min(1, 'Purchase order ID is required'),
  paypalOrderId: z.string().min(1, 'PayPal order ID is required'),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getDemoUser()
    const body = await request.json().catch(() => ({}))
    const parsed = captureOrderSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { purchaseOrderId, paypalOrderId } = parsed.data

    // 1. Fetch purchase order from database
    const order = await prisma.purchaseOrder.findFirst({
      where: {
        id: purchaseOrderId,
        userId: user.id,
      },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })
    }

    // 2. Duplicate capture protection: If already PAID, return existing completed payment
    if (order.status === 'PAID') {
      const completedPayment = order.payments.find((p) => p.status === 'COMPLETED')
      return NextResponse.json({
        data: {
          purchaseOrderId: order.id,
          paypalOrderId,
          captureId: completedPayment?.captureId,
          status: 'COMPLETED',
          message: 'Order was already captured and marked PAID.',
          alreadyCaptured: true,
        },
      })
    }

    // 3. Precondition: Order must be in PAYMENT_PENDING
    if (order.status !== 'PAYMENT_PENDING') {
      return NextResponse.json(
        {
          error: `Cannot capture payment for order in status "${order.status}". Expected PAYMENT_PENDING.`,
        },
        { status: 400 }
      )
    }

    // 4. Fetch the PayPal Order from PayPal Sandbox to verify ownership and amount
    const paypalOrder = await getPayPalOrder(paypalOrderId)
    const unit = paypalOrder.purchase_units?.[0]

    if (!unit) {
      throw new Error('PayPal order does not contain any purchase units')
    }

    // Verification 1: Verify order belongs to this purchase order (custom_id or reference_id)
    const matchesPo = unit.custom_id === order.id || unit.reference_id === order.id
    if (!matchesPo) {
      await prisma.auditLog.create({
        data: {
          action: 'PAYMENT_FAILED',
          entityType: 'PAYMENT',
          entityId: order.id,
          userId: user.id,
          details: {
            reason: 'REFERENCE_MISMATCH',
            expectedOrderId: order.id,
            receivedCustomId: unit.custom_id,
            receivedReferenceId: unit.reference_id,
          },
        },
      })
      return NextResponse.json(
        { error: 'Security verification failed: PayPal order does not match purchase order reference.' },
        { status: 400 }
      )
    }

    // Verification 2: Verify amount and currency match the database record exactly
    const expectedAmountStr = centsToString(order.totalAmount)
    const receivedAmountStr = unit.amount.value
    const expectedCurrency = order.currency
    const receivedCurrency = unit.amount.currency_code

    if (expectedAmountStr !== receivedAmountStr || expectedCurrency !== receivedCurrency) {
      await prisma.auditLog.create({
        data: {
          action: 'PAYMENT_FAILED',
          entityType: 'PAYMENT',
          entityId: order.id,
          userId: user.id,
          details: {
            reason: 'AMOUNT_OR_CURRENCY_MISMATCH',
            expected: { amount: expectedAmountStr, currency: expectedCurrency },
            received: { amount: receivedAmountStr, currency: receivedCurrency },
          },
        },
      })
      return NextResponse.json(
        {
          error: `Financial verification failed: Expected ${expectedCurrency} ${expectedAmountStr}, but PayPal order has ${receivedCurrency} ${receivedAmountStr}.`,
        },
        { status: 400 }
      )
    }

    // 5. Check if the order is already captured in PayPal
    const existingCapture = unit.payments?.captures?.[0]
    let captureResponse

    if (existingCapture && existingCapture.status === 'COMPLETED') {
      captureResponse = {
        id: paypalOrder.id,
        status: existingCapture.status,
        purchase_units: paypalOrder.purchase_units,
      }
    } else {
      // Execute capture via PayPal API
      const captureIdempotencyKey = `cap_${order.id}_${Date.now()}`
      captureResponse = await capturePayPalOrder(paypalOrderId, captureIdempotencyKey)
    }

    // Extract capture details
    const capture = captureResponse.purchase_units?.[0]?.payments?.captures?.[0]
    const captureId = capture?.id || captureResponse.id
    const captureStatus = capture?.status || captureResponse.status

    // 6. Handle capture outcome inside atomic Prisma transaction
    if (captureStatus === 'COMPLETED') {
      // Verification: check captured amount
      if (capture?.amount) {
        if (
          capture.amount.value !== expectedAmountStr ||
          capture.amount.currency_code !== expectedCurrency
        ) {
          throw new Error('Post-capture verification failed: captured amount does not match expected order total.')
        }
      }

      await prisma.$transaction(async (tx) => {
        // Find existing Payment record or create one
        const existingPayment = await tx.payment.findFirst({
          where: {
            purchaseOrderId: order.id,
            paypalOrderId,
          },
        })

        if (existingPayment) {
          await tx.payment.update({
            where: { id: existingPayment.id },
            data: {
              status: 'COMPLETED',
              captureId,
              rawResponse: captureResponse as any,
            },
          })
        } else {
          await tx.payment.create({
            data: {
              purchaseOrderId: order.id,
              paypalOrderId,
              captureId,
              status: 'COMPLETED',
              amount: order.totalAmount,
              currency: order.currency,
              idempotencyKey: `pay_${order.id}_${Date.now()}`,
              rawResponse: captureResponse as any,
            },
          })
        }

        // Transition order state to PAID
        await transitionPurchaseOrderState(tx, {
          orderId: order.id,
          toStatus: 'PAID',
          userId: user.id,
          action: 'CAPTURE_PAYPAL_ORDER',
          metadata: {
            paypalOrderId,
            captureId,
            amountCents: order.totalAmount,
            currency: order.currency,
          },
        })

        // Log audit verification
        await tx.auditLog.create({
          data: {
            action: 'VERIFY_PAYMENT',
            entityType: 'PAYMENT',
            entityId: order.id,
            userId: user.id,
            details: {
              paypalOrderId,
              captureId,
              verifiedAmountCents: order.totalAmount,
              verifiedCurrency: order.currency,
              status: 'COMPLETED',
            },
          },
        })
      })

      return NextResponse.json({
        data: {
          purchaseOrderId: order.id,
          paypalOrderId,
          captureId,
          status: 'PAID',
          paymentStatus: 'COMPLETED',
          message: 'Payment successfully captured and verified. Purchase order is now PAID.',
        },
      })
    } else {
      // Payment declined or failed
      await prisma.$transaction(async (tx) => {
        await tx.payment.updateMany({
          where: {
            purchaseOrderId: order.id,
            paypalOrderId,
          },
          data: {
            status: 'FAILED',
            rawResponse: captureResponse as any,
          },
        })

        await transitionPurchaseOrderState(tx, {
          orderId: order.id,
          toStatus: 'FAILED',
          userId: user.id,
          action: 'PAYMENT_FAILED',
          metadata: {
            paypalOrderId,
            captureStatus,
            rawResponse: captureResponse,
          },
        })
      })

      return NextResponse.json(
        {
          error: `PayPal payment capture was not completed. Status: "${captureStatus}".`,
          status: 'FAILED',
        },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('Error capturing PayPal payment:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Payment capture failed' },
      { status: 500 }
    )
  }
}

