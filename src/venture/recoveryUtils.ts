import { APIError, type PayloadRequest } from 'payload'
import { z } from 'zod'

const transaction = z.object({
  label: z.string().min(1).max(200),
  hash: z.string().regex(/^0x[\da-fA-F]{64}$/),
})
export const recoveryRecordSchema = z.object({
  values: z.object({
    tokenName: z.string().min(1).max(100),
    tokenSymbol: z.string().min(1).max(100),
    initialSupply: z
      .string()
      .regex(/^[1-9]\d*$/)
      .max(100),
    tokensPerEth: z
      .string()
      .regex(/^\d+(\.\d{1,18})?$/)
      .max(100),
    deploymentNetwork: z.enum(['ethereum', 'sepolia', 'localhost']),
    acknowledged: z.literal(true),
  }),
  transactions: z.array(transaction).max(100),
  progress: z.array(transaction).max(100),
  manifest: z.json().nullable(),
  saved: z.boolean().optional(),
})

export const authorizeVentureRecovery = async (req: PayloadRequest) => {
  if (!req.user) {
    throw new Error('Log into this marketplace server to recover a deployment.')
  }
  const venture = await req.payload.findByID({
    collection: 'startups',
    id: String(req.routeParams?.id),
    depth: 0,
    overrideAccess: false,
    user: req.user,
    req,
  })
  if (venture.createdBy !== req.user.id && !req.user.role?.includes('admin')) {
    throw new APIError(
      'Only the Venture owner or an administrator can access deployment recovery.',
      403,
    )
  }
  const wallet = z
    .string()
    .regex(/^0x[\da-fA-F]{40}$/)
    .parse(req.query.walletAddress)
    .toLowerCase()
  return `${req.user.id}:${venture.id}:${wallet}`
}
