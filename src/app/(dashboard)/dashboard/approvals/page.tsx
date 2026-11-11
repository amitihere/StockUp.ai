import { CheckCircle2 } from 'lucide-react'
import { PlaceholderPage } from '@/components/layout/PlaceholderPage'

export default function ApprovalsPage() {
  return (
    <PlaceholderPage
      title="Procurement Approvals"
      partName="Order Approvals & Review Gates"
      partNumber="Part 2"
      description="Merchant review gates for purchase orders exceeding automatic authorization thresholds"
      icon={CheckCircle2}
      features={[
        'Review proposals flagged above the $100.00 approval threshold',
        'Line-item inspection, quantity adjustments, and budget impact preview',
        'One-click Merchant Approval or Rejection with audit notes',
        'Automatic routing to PayPal sandbox execution pipeline upon signoff',
      ]}
    />
  )
}

