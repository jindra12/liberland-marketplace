import type { VerifyOrderPaymentResult } from '@/crypto'
import type { ProductPaymentTarget } from '@/crypto/recipient'
import type { Order } from '@/payload-types'
import uniq from 'lodash/uniq.js'
import type { GroupField, PayloadRequest } from 'payload'

type InitiatePaymentArgs = {
  data: unknown
  req: PayloadRequest
  transactionsSlug: string
}

type ConfirmOrderArgs = {
  cartsSlug?: string
  data: unknown
  ordersSlug?: string
  req: PayloadRequest
  transactionsSlug?: string
}

const group: GroupField = {
  name: 'crypto',
  type: 'group',
  admin: {
    condition: (data) => data?.paymentMethod === 'crypto',
  },
  fields: [
    {
      name: 'paymentRef',
      type: 'text',
      label: 'Payment reference (invoice / address)',
      admin: { readOnly: true },
    },
    {
      name: 'txHash',
      type: 'text',
      label: 'Transaction hash',
    },
  ],
}

const buildPaymentRef = ({
  paymentTargets,
  transactionHashEntries,
}: {
  paymentTargets: ProductPaymentTarget[]
  transactionHashEntries: Order["transactionHashes"]
}): string => {
  const paymentTargetByProductID = new Map(paymentTargets.map((target) => [target.productID, target]))

  return uniq(
    transactionHashEntries?.map((entry) => {
      const target = paymentTargetByProductID.get(typeof entry.product === "string" ? entry.product : entry.product.id)!
      return `${entry.chain}:${target.recipientAddress}`
    }) || [],
  ).join(' | ')
}

const buildVerificationErrorMessage = (
  result: VerifyOrderPaymentResult,
): string => {
  if (result.error) {
    return result.error
  }

  const failedChecks = result.results.filter((entry) => !entry.ok)
  if (failedChecks.length === 0) {
    return 'Unknown payment verification error.'
  }

  return failedChecks
    .map((entry) => {
      const hashFragment = entry.transactionHash ? ` (${entry.transactionHash})` : ''
      return `[${entry.chain}${hashFragment}] ${entry.error ?? 'verification failed'}`
    })
    .join(' | ')
}

const appendTransactionToOrder = ({
  order,
  transactionID,
}: {
  order: Record<string, unknown>
  transactionID: string
}): string[] => {
  const transactions = (order.transactions as unknown[] | undefined) ?? []
  const ids = transactions
    .map((entry) => {
      if (typeof entry === 'string' || typeof entry === 'number') {
        const id = String(entry).trim()
        return id.length > 0 ? id : null
      }

      if (entry && typeof entry === 'object' && 'id' in entry) {
        const candidate = (entry as { id?: unknown }).id
        if (typeof candidate === 'string' || typeof candidate === 'number') {
          const id = String(candidate).trim()
          return id.length > 0 ? id : null
        }
      }

      return null
    })
    .filter((id): id is string => Boolean(id))
  ids.push(transactionID)
  return uniq(ids)
}

const upsertTransaction = async ({
  amount,
  currency,
  customer,
  customerEmail,
  items,
  orderID,
  paymentRef,
  req,
  status,
  transactionHashReference,
  transactionID,
}: {
  amount: number
  currency: 'USD'
  customer: string
  customerEmail: string
  items: Order["items"]
  orderID: string
  paymentRef: string
  req: PayloadRequest
  status: 'failed' | 'succeeded'
  transactionHashReference: string
  transactionID?: string
}) => {
  const data = {
    amount,
    currency,
    customer,
    customerEmail,
    items,
    order: orderID,
    paymentMethod: 'crypto' as const,
    status,
    crypto: {
      paymentRef,
      txHash: transactionHashReference,
    },
  }

  if (transactionID) {
    return req.payload.update({
      collection: 'transactions',
      id: transactionID,
      data,
      req,
    })
  }

  return req.payload.create({
    collection: 'transactions',
    data,
    req,
  })
}

export const cryptoAdapter = () => ({
  initiatePayment: async (_args: InitiatePaymentArgs) => {
    return {
      message: 'Crypto payment initiated.',
    }
  },

  confirmOrder: async ({
    data,
    req,
  }: ConfirmOrderArgs) => {
    const [{ verifyTransactionOccurred }, { resolveProductPaymentTargetsFromItems }] =
      await Promise.all([import('@/crypto'), import('@/crypto/recipient')])
    const payloadData = data as { orderID: string };

    const order = await req.payload.findByID({
      collection: 'orders',
      id: payloadData.orderID,
      depth: 2,
      overrideAccess: false,
      req,
      select: {
        amount: true,
        currency: true,
        customer: true,
        customerEmail: true,
        items: true,
        transactionHashes: true,
        transactions: true,
      },
    })!

    const paymentTargets = await resolveProductPaymentTargetsFromItems({
      items: order.items || [],
      payload: req.payload,
      req,
    })

    const paymentRef = buildPaymentRef({
      paymentTargets,
      transactionHashEntries: order.transactionHashes || [],
    })

    const transactionHashReference = uniq((order.transactionHashes || []).map((entry) => entry.transactionHash)).join(',')
    const customerID =
      (typeof order.customer === 'string' ? order.customer : order.customer?.id) ??
      (typeof req.user === 'string' ? req.user : req.user?.id)

    if (!customerID) {
      throw new Error('Missing customer id for transaction.')
    }

    const amount = Number(order.amount)
    const currency = 'USD'
    const firstTransaction = order.transactions?.[0]
    const inferredTransactionID = typeof firstTransaction === "string" ? firstTransaction : firstTransaction?.id;

    const verification = await verifyTransactionOccurred(payloadData.orderID)
    const verificationPassed = verification.ok

    const transaction = await upsertTransaction({
      amount,
      currency,
      customer: customerID,
      customerEmail: order.customerEmail!,
      items: order.items || [],
      orderID: payloadData.orderID,
      paymentRef,
      req,
      status: verificationPassed ? 'succeeded' : 'failed',
      transactionHashReference,
      transactionID: inferredTransactionID,
    })

    await req.payload.update({
      collection: 'orders',
      id: payloadData.orderID,
      data: {
        status: verificationPassed ? 'completed' : 'cancelled',
        transactions: appendTransactionToOrder({
          order,
          transactionID: transaction.id,
        }),
      },
      context: {
        skipAutoOrderCryptoConfirm: true,
      },
      req,
    })

    if (!verificationPassed) {
      throw new Error(buildVerificationErrorMessage(verification))
    }

    return {
      message: 'Crypto order confirmed.',
      orderID: payloadData.orderID,
      transactionID: transaction.id,
    }
  },
  name: 'crypto',
  group,
})
