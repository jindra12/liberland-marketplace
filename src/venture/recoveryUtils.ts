import { APIError, type PayloadRequest, type Where } from 'payload'
import { z } from 'zod'
import isEqual from 'lodash/isEqual.js'
import type { VentureDeploymentRecovery } from '@/payload-types'

const transaction = z.object({
  label: z.string().min(1).max(200),
  hash: z.string().regex(/^0x[\da-fA-F]{64}$/),
  nonce: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  chainId: z
    .string()
    .regex(/^[1-9]\d*$/)
    .max(100)
    .optional(),
  submittedAtBlock: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
})
export const recoveryRecordSchema = z
  .object({
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
    runnerId: z.uuid().optional(),
  })
  .refine((record) => !record.saved || Boolean(record.manifest), {
    message: 'A saved deployment must include its contract manifest.',
    path: ['manifest'],
  })

export const recoveryActionSchema = z.object({
  action: z.enum(['takeover', 'abandon']),
  runnerId: z.uuid(),
  confirmed: z.literal(true),
  record: recoveryRecordSchema,
})

export const assertRecoverySnapshot = (
  existing: VentureDeploymentRecovery,
  expected: z.infer<typeof recoveryRecordSchema>,
) => {
  if (!isEqual(recoveryRecordSchema.parse(existing.record), expected)) {
    throw new APIError(
      'Deployment recovery changed. Reload and reconcile it before continuing.',
      409,
    )
  }
}

/** Fence every checkpoint, takeover and archive against concurrent journal changes. */
export const updateRecoveryDocument = async (
  req: PayloadRequest,
  existing: VentureDeploymentRecovery,
  data: Partial<Pick<VentureDeploymentRecovery, 'key' | 'record'>>,
) => {
  const revision: Where = existing.revision
    ? { revision: { equals: existing.revision } }
    : {
        or: [
          { revision: { equals: 0 } },
          { revision: { equals: null } },
          { revision: { exists: false } },
        ],
      }
  const updated = await req.payload.db.updateOne({
    collection: 'venture-deployment-recoveries',
    where: { and: [{ id: { equals: existing.id } }, { key: { equals: existing.key } }, revision] },
    data: { ...data, revision: (existing.revision ?? 0) + 1 },
    req,
  })
  if (!updated) {
    throw new APIError(
      'Deployment recovery changed while saving. Reload the journal before retrying.',
      409,
    )
  }
}

export const archivedRecoveryKey = (key: string, runnerId: string) => `${key}:archived:${runnerId}`

export const mergeRecoveryRecord = (
  existing: z.infer<typeof recoveryRecordSchema>,
  incoming: z.infer<typeof recoveryRecordSchema>,
): z.infer<typeof recoveryRecordSchema> => {
  if (existing.runnerId && existing.runnerId !== incoming.runnerId) {
    throw new APIError(
      'This journal belongs to another deployment runner. Stop it before taking over recovery.',
      409,
    )
  }
  if (!isEqual(existing.values, incoming.values)) {
    throw new APIError(
      'Deployment parameters changed. Clear the previous journal before starting another deployment.',
      409,
    )
  }
  const mergeSteps = (
    previous: typeof existing.transactions,
    next: typeof incoming.transactions,
  ) => {
    if (
      next.some((step) =>
        previous.some((saved) => saved.label === step.label && saved.hash !== step.hash),
      )
    ) {
      throw new APIError(
        'A confirmed deployment step cannot be replaced with a different transaction.',
        409,
      )
    }
    return Array.from(new Map([...previous, ...next].map((step) => [step.label, step])).values())
  }
  if (existing.manifest && incoming.manifest && !isEqual(existing.manifest, incoming.manifest)) {
    throw new APIError('The confirmed deployment manifest cannot be replaced.', 409)
  }
  return recoveryRecordSchema.parse({
    ...incoming,
    transactions: Array.from(
      new Map(
        [...existing.transactions, ...incoming.transactions].map((step) => [
          `${step.label}:${step.hash}`,
          step,
        ]),
      ).values(),
    ),
    progress: mergeSteps(existing.progress, incoming.progress),
    manifest: existing.manifest || incoming.manifest,
    saved: Boolean(existing.saved || incoming.saved),
  })
}

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
  return `${venture.createdBy}:${venture.id}:${wallet}`
}
