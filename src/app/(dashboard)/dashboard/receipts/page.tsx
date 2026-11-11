import { ReceiptText } from 'lucide-react'
import { PlaceholderPage } from '@/components/layout/PlaceholderPage'

export default function ReceiptsPage() {
  return (
    <PlaceholderPage
      title="Receipt Intelligence"
      partName="Vision OCR & Demand Extraction"
      partNumber="Part 4"
      description="Sales receipt photography, structured line-item extraction, and autonomous stock deduction"
      icon={ReceiptText}
      features={[
        'Photo upload for physical sales slips and wholesale paper invoices',
        'Multimodal Vision OCR extracting items, quantities, and prices to Zod schemas',
        'Human confirmation review screen with split-view photo & editable AG Grid',
        'Automatic inventory deduction triggering autonomous replenishment runs',
      ]}
    />
  )
}

