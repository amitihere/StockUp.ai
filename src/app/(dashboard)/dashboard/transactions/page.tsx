import { CreditCard } from 'lucide-react'
import { PlaceholderPage } from '@/components/layout/PlaceholderPage'

export default function TransactionsPage() {
  return (
    <PlaceholderPage
      title="Transactions & PayPal Payments"
      partName="PayPal Orders API & Settlements"
      partNumber="Part 4"
      description="Idempotent PayPal sandbox order creation, merchant capture, and payment ledger"
      icon={CreditCard}
      features={[
        'PayPal Orders API sandbox integration (v2/checkout/orders)',
        'Server-side capture with unique idempotency keys',
        'End-to-end trace: Sale -> Shortage -> Proposal -> Approval -> PayPal Capture ID',
        'AG Grid transaction audit log with downloadable receipt artifacts',
      ]}
    />
  )
}

