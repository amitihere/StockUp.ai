import { z } from 'zod'

// Product validation schema for creation (expects dollar value from UI/caller)
export const productCreateSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(100, 'Name must be 100 characters or less'),
  sku: z.string().trim().min(1, 'SKU is required').max(50, 'SKU must be 50 characters or less'),
  category: z.string().trim().min(1, 'Category is required').max(50, 'Category must be 50 characters or less'),
  currentStock: z.coerce.number().int('Stock must be an integer').min(0, 'Current stock cannot be negative'),
  minStock: z.coerce.number().int('Minimum stock must be an integer').min(0, 'Minimum stock cannot be negative'),
  unitCostDollars: z.coerce.number().min(0, 'Unit cost cannot be negative'),
  currency: z.string().trim().default('USD'),
})

// Product validation schema for update
export const productUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required').max(100, 'Name must be 100 characters or less').optional(),
  sku: z.string().trim().min(1, 'SKU is required').max(50, 'SKU must be 50 characters or less').optional(),
  category: z.string().trim().min(1, 'Category is required').max(50, 'Category must be 50 characters or less').optional(),
  currentStock: z.coerce.number().int('Stock must be an integer').min(0, 'Current stock cannot be negative').optional(),
  minStock: z.coerce.number().int('Minimum stock must be an integer').min(0, 'Minimum stock cannot be negative').optional(),
  unitCostDollars: z.coerce.number().min(0, 'Unit cost cannot be negative').optional(),
  currency: z.string().trim().default('USD').optional(),
})

// ProcurementPolicy validation schema
export const policyUpdateSchema = z.object({
  monthlyBudgetDollars: z.coerce.number().min(0, 'Monthly budget cannot be negative'),
  maxAutomaticPurchaseDollars: z.coerce.number().min(0, 'Max automatic purchase cannot be negative'),
  requireApprovalAboveDollars: z.coerce.number().min(0, 'Approval threshold cannot be negative'),
  minimumProductRating: z.coerce
    .number()
    .min(0, 'Minimum rating must be at least 0')
    .max(5, 'Minimum rating cannot exceed 5'),
  allowAutomaticPurchases: z.boolean({
    required_error: 'Allow automatic purchases is required',
  }),
  currency: z.string().trim().default('USD'),
})

export type ProductCreateInput = z.infer<typeof productCreateSchema>
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>
export type PolicyUpdateInput = z.infer<typeof policyUpdateSchema>

