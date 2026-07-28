import type { VerifyOrderPaymentResult } from '@/crypto'
import type { ProductPaymentTarget } from '@/crypto/recipient'
import { getOrderPaymentTargetEntries, type OrderWithPaymentProofs } from '@/crypto/order'
import type { PaymentProofRow } from '@/fields/orderFields'
import { TEXT_INPUT_MAX_LENGTH } from '@/fields/constants'
import type { Order } from '@/payload-types'
import { toStringID } from '@/utilities/toStringID'
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
      maxLength: TEXT_INPUT_MAX_LENGTH,
      label: 'Payment reference (invoice / address)',
      admin: { readOnly: true },
    },
    {
      name: 'txHash',
      type: 'text',
      maxLength: TEXT_INPUT_MAX_LENGTH,
      label: 'Transaction hash',
    },
  ],
}

const buildPaymentRef = ({
  paymentTargets,
  paymentProofEntries,
}: {
  paymentTargets: ProductPaymentTarget[]
  paymentProofEntries: PaymentProofRow[] | null | undefined
}): string => {
  const paymentTargetByProductID = new Map(
    paymentTargets.map((target) => [target.productID, target]),
  )

  return uniq(
    paymentProofEntries
      ?.map((entry) => {
        const productID = toStringID(entry.product)
        if (!productID) {
          return null
        }

        const target = paymentTargetByProductID.get(productID)
        if (!target || !entry.chain) {
          return null
        }

        return `${entry.chain}:${target.recipientAddress}`
      })
      .filter((value): value is string => Boolean(value)) || [],
  ).join(' | ')
}

const buildVerificationErrorMessage = (result: VerifyOrderPaymentResult): string => {
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
  order: OrderWithPaymentProofs
  transactionID: string
}): string[] => {
  const transactions = Array.isArray(order.transactions) ? order.transactions : []
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
  items: Order['items']
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

  confirmOrder: async ({ data, req }: ConfirmOrderArgs) => {
    const { verifyTransactionOccurred } = await import('@/crypto')
    const payloadData = data as { orderID: string }

    const order = (await req.payload.findByID({
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
        paymentProofs: true,
        paymentTargets: true,
        transactions: true,
      },
    })) as unknown as OrderWithPaymentProofs

    const resolvedPaymentTargets = getOrderPaymentTargetEntries(order)

    const paymentProofEntries = Array.isArray(order.paymentProofs) ? order.paymentProofs : []

    const paymentRef = buildPaymentRef({
      paymentTargets: resolvedPaymentTargets,
      paymentProofEntries,
    })

    const transactionHashReference = uniq(
      paymentProofEntries.map((entry) => entry.transactionHash),
    ).join(',')
    const customerID = toStringID(order.customer) || toStringID(req.user)

    if (!customerID) {
      throw new Error('Missing customer id for transaction.')
    }

    const amount = Number(order.amount)
    const currency = 'USD'
    const transactions = Array.isArray(order.transactions) ? order.transactions : []
    const items = Array.isArray(order.items) ? order.items : []
    const firstTransaction = transactions[0]
    const inferredTransactionID =
      typeof firstTransaction === 'string' ? firstTransaction : firstTransaction?.id
    const customerEmail = typeof order.customerEmail === 'string' ? order.customerEmail : null

    if (!customerEmail) {
      throw new Error('Missing customer email for transaction.')
    }

    const verification = await verifyTransactionOccurred(payloadData.orderID)
    const verificationPassed = verification.ok

    const transaction = await upsertTransaction({
      amount,
      currency,
      customer: customerID,
      customerEmail,
      items,
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
          transactionID: toStringID(transaction.id) ?? '',
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
