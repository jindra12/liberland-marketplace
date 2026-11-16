import BigNumber from 'bignumber.js'
import groupBy from 'lodash/groupBy.js'
import { APIError, type PayloadRequest } from 'payload'
import type { Order } from '@/payload-types'
import { getOrderPaymentTargetEntries } from '@/crypto/order'
import { toStringID } from '@/utilities/toStringID'

/** Credentials alone do not mean the operator has registered and tested the callback. */
export const isThirdwebOrderCheckoutEnabled = async (req: PayloadRequest): Promise<boolean> => {
  if (!process.env.THIRDWEB_CLIENT_ID || !process.env.THIRDWEB_WEBHOOK_SECRET) {
    return false
  }
  const settings = await req.payload.findGlobal({
    slug: 'marketplace-payments',
    depth: 0,
    overrideAccess: true,
    req,
  })
  return Boolean(settings.thirdwebCheckoutEnabled)
}

/** Every company in a recipient group must consent to receiving USDC on Base. */
export const getThirdwebOrderRecipients = async (
  order: Partial<Pick<Order, 'id' | 'paymentTargets'>>,
  req: PayloadRequest,
): Promise<string[]> => {
  if (!(await isThirdwebOrderCheckoutEnabled(req))) {
    return []
  }
  const snapshot =
    !order.paymentTargets && order.id
      ? await req.payload.db.findOne<Order>({
          collection: 'orders',
          where: { id: { equals: order.id } },
          req,
        })
      : order
  const targets = getOrderPaymentTargetEntries(snapshot || {}).filter(
    (target) => target.chain === 'ethereum',
  )
  if (!targets.length) {
    return []
  }
  // Read consent from canonical records, not caller-provided relationships or editorial drafts.
  const products = await req.payload.find({
    collection: 'products',
    where: { id: { in: targets.map((target) => target.productID) } },
    select: { company: true },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const companyIds = products.docs
    .map((product) => toStringID(product.company))
    .filter((id): id is string => Boolean(id))
  const companies = await req.payload.find({
    collection: 'companies',
    where: { id: { in: companyIds } },
    select: { acceptThirdwebPayments: true },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const acceptingCompanies = new Set(
    companies.docs.filter((company) => company.acceptThirdwebPayments).map((company) => company.id),
  )
  const acceptingProducts = new Set(
    products.docs
      .filter((product) => {
        const companyId = toStringID(product.company)
        return companyId && acceptingCompanies.has(companyId)
      })
      .map((product) => product.id),
  )
  return Object.entries(groupBy(targets, (target) => target.recipientAddress.toLowerCase()))
    .filter(([, group]) => group.every((target) => acceptingProducts.has(target.productID)))
    .map(([recipient]) => recipient)
}

/** A normal checkout payment covers one frozen Ethereum recipient group, not current catalog prices. */
export const getOrderCheckoutGroup = (
  order: Pick<Order, 'id' | 'paymentTargets'>,
  recipient: string,
) => {
  const targets = getOrderPaymentTargetEntries(order).filter(
    (target) =>
      target.chain === 'ethereum' &&
      target.recipientAddress.toLowerCase() === recipient.toLowerCase(),
  )
  const cents = targets
    .reduce((total, target) => total.plus(target.stableAmount), new BigNumber(0))
    .times(100)
  if (!targets.length || !cents.isInteger() || cents.lt(100) || cents.gt(100_000_000)) {
    throw new APIError(
      'This order has no supported USD payment group for that Ethereum recipient (minimum $1).',
      400,
    )
  }
  return {
    targets,
    amountUsdCents: cents.toNumber(),
    receiver: targets[0].recipientAddress,
    paymentKey: `${order.id}:ethereum:${recipient.toLowerCase()}`,
  }
}
