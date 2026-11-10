export const operationalFields = {
  orders: [
    'operationalUpdatedAt',
    'paymentProofs',
    'transactions',
    'status',
    'inventoryAppliedAt',
    'purchaseCountAppliedAt',
    'purchaseCountStartedAt',
  ],
  products: [
    'inventory',
    'purchaseCount',
    'inventoryApplications',
    'purchaseApplications',
    'operationalUpdatedAt',
    'contentRankScore',
  ],
  variants: ['inventory', 'inventoryApplications', 'operationalUpdatedAt'],
  startups: ['involvedUsers', 'contractDeployments', 'operationalUpdatedAt'],
} as const
