import type { CollectionAfterChangeHook } from 'payload'

import { resolveProductIDsForItems } from '@/crypto/recipient'
import type { Company } from '@/payload-types'
import { buildNotificationEmail, sendNotificationEmails } from './notificationEmails'

type OrderDoc = {
  amount?: number | null
  company?: string | Company | null
  customerEmail?: string | null
  id: string
  items?: unknown
  status?: string | null
}

const isCompletedOrder = ({
  doc,
  operation,
  previousDoc,
}: {
  doc: OrderDoc
  operation: string
  previousDoc?: OrderDoc
}): boolean => {
  if (doc.status !== 'completed') {
    return false
  }

  if (operation === 'create') {
    return true
  }

  return previousDoc?.status !== 'completed'
}

const getCompanyEmail = async ({
  company,
  req,
}: {
  company: string | Company | null | undefined
  req: Parameters<CollectionAfterChangeHook>[0]['req']
}): Promise<string | null> => {
  if (!company) {
    return null
  }

  if (typeof company === 'object') {
    return typeof company.email === 'string' && company.email.length > 0 ? company.email : null
  }

  const companyDoc = await req.payload.findByID({
    collection: 'companies',
    depth: 0,
    id: company,
    overrideAccess: false,
    req,
  })

  return typeof companyDoc.email === 'string' && companyDoc.email.length > 0 ? companyDoc.email : null
}

const getOrderNotificationRecipients = async ({
  order,
  req,
}: {
  order: OrderDoc
  req: Parameters<CollectionAfterChangeHook>[0]['req']
}): Promise<string[]> => {
  const productIDs = await resolveProductIDsForItems({
    items: order.items,
    payload: req.payload,
    req,
  })

  const companyEmails = await Promise.all(
    productIDs.map(async (productID) => {
      const product = await req.payload.findByID({
        collection: 'products',
        depth: 1,
        id: productID,
        overrideAccess: false,
        req,
      })

      return getCompanyEmail({
        company: product.company as string | Company | null | undefined,
        req,
      })
    }),
  )

  const uniqueCompanyEmails = Array.from(
    new Set(companyEmails.filter((email): email is string => Boolean(email))),
  )

  if (uniqueCompanyEmails.length > 0) {
    return uniqueCompanyEmails
  }

  return typeof order.customerEmail === 'string' && order.customerEmail.length > 0
    ? [order.customerEmail]
    : []
}

export const sendOrderCompletedNotifications: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  const order = doc as OrderDoc

  if (!isCompletedOrder({ doc: order, operation, previousDoc: previousDoc as OrderDoc })) {
    return doc
  }

  const recipients = await getOrderNotificationRecipients({
    order,
    req,
  })

  if (recipients.length === 0) {
    return doc
  }

  const amount = typeof order.amount === 'number' ? order.amount.toFixed(2) : 'unknown'
  const content = await buildNotificationEmail({
    details: [
      {
        label: 'Order ID',
        value: order.id,
      },
      {
        label: 'Status',
        value: 'completed',
      },
      {
        label: 'Amount',
        value: amount,
      },
    ],
    intro:
      recipients.length > 0 && typeof order.customerEmail === 'string'
        ? 'A crypto payment was verified and the order was marked as completed.'
        : 'A crypto payment was verified for an order associated with your company.',
    title: 'Order verified',
  })

  await sendNotificationEmails({
    content,
    recipients,
    req,
    subject: `Order verified: ${order.id}`,
  })

  return doc
}
