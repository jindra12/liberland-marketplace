import { randomBytes } from 'node:crypto'
import { APIError, type PayloadRequest, type UpdateOne } from 'payload'
import { isAddress } from 'thirdweb/utils'
import type { Company, PaymentWebhookCredential } from '@/payload-types'
import { isAdminUser } from '@/access/admin'
import { toStringID } from '@/utilities/toStringID'
import { paymentWebhookUrlSchema } from './utils'

const findCredential = (req: PayloadRequest, companyId: string) =>
  req.payload.db.findOne<PaymentWebhookCredential>({
    collection: 'payment-webhook-credentials',
    where: { company: { equals: companyId } },
    req,
  })

export const getPaymentWebhookSecret = async (req: PayloadRequest, companyId: string) => {
  const credential = await findCredential(req, companyId)
  if (credential) {
    return credential.secret
  }
  // Preserve existing integrations until their first explicit rotation.
  const company = await req.payload.db.findOne<Company>({
    collection: 'companies',
    where: { id: { equals: companyId } },
    req,
  })
  return company?.paymentWebhookSecret
}

// Public readiness reveals no webhook URL or credential. Read the stored configuration
// because Payload removes private fields from anonymous company responses.
export const canAcceptCompanyDonations = async (req: PayloadRequest, companyId: string) => {
  if (!process.env.THIRDWEB_CLIENT_ID || !process.env.THIRDWEB_WEBHOOK_SECRET) {
    return false
  }
  const company = await req.payload.db.findOne<Company>({
    collection: 'companies',
    where: { id: { equals: companyId } },
    req,
  })
  if (
    !company?.acceptThirdwebDonations ||
    company._status !== 'published' ||
    company.isPrivate ||
    company.cryptoAddresses?.chain !== 'ethereum' ||
    !company.cryptoAddresses.address ||
    !isAddress(company.cryptoAddresses.address) ||
    !paymentWebhookUrlSchema.safeParse(company.paymentWebhookUrl).success
  ) {
    return false
  }
  return Boolean(await getPaymentWebhookSecret(req, companyId))
}

const authorizeIntegration = async (req: PayloadRequest, companyId: string) => {
  req.responseHeaders = new Headers(req.responseHeaders)
  req.responseHeaders.set('Cache-Control', 'private, no-store')
  if (!req.user) {
    throw new APIError('Sign in to manage payment integration settings.', 401)
  }
  const company = await req.payload.findByID({
    collection: 'companies',
    id: companyId,
    draft: true,
    depth: 0,
    overrideAccess: false,
    req,
  })
  if (!isAdminUser(req.user) && toStringID(company.createdBy) !== String(req.user.id)) {
    throw new APIError(
      'Only the company owner or an admin can manage payment integration settings.',
      403,
    )
  }
  return company
}

export const readCompanyPaymentSettings = async (req: PayloadRequest, companyId: string) => {
  const company = await authorizeIntegration(req, companyId)
  return {
    companyId: company.id,
    paymentWebhookUrl: company.paymentWebhookUrl,
    hasWebhookSecret: Boolean(await getPaymentWebhookSecret(req, companyId)),
  }
}

export const issueCompanyPaymentSecret = async (
  req: PayloadRequest,
  companyId: string,
  action: 'generate' | 'rotate',
) => {
  await authorizeIntegration(req, companyId)
  const existing = await findCredential(req, companyId)
  const previousSecret = await getPaymentWebhookSecret(req, companyId)
  if ((action === 'generate' && previousSecret) || (action === 'rotate' && !previousSecret)) {
    throw new APIError(
      'The signing secret state changed. Refresh settings before trying again.',
      409,
    )
  }
  const secret = randomBytes(32).toString('hex')
  if (existing) {
    const write: UpdateOne = req.payload.db.updateOne.bind(req.payload.db)
    const updated = await write({
      collection: 'payment-webhook-credentials',
      where: { and: [{ id: { equals: existing.id } }, { secret: { equals: existing.secret } }] },
      data: { secret },
      req,
    })
    if (!updated) {
      throw new APIError(
        'The signing secret was changed by another request. Refresh settings.',
        409,
      )
    }
  } else {
    await req.payload.create({
      collection: 'payment-webhook-credentials',
      overrideAccess: true,
      req,
      data: { company: companyId, secret },
    })
  }
  return { companyId, secret }
}
