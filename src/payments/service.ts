import { randomUUID } from 'node:crypto'
import { APIError, type PayloadRequest, type UpdateOne } from 'payload'
import { isAddress } from 'thirdweb/utils'
import { z } from 'zod'
import type { CheckoutSession, Company } from '@/payload-types'
import { getFrontendURL, getServerSideURL } from '@/utilities/getURL'
import { toStringID } from '@/utilities/toStringID'
import { CHECKOUT_SETTLEMENT } from './constants'
import { createCheckoutSchema, verifyPaymentRequest } from './utils'
import type { PaymentNotification } from './types'
import { parseThirdwebPayment } from './provider'
import { getPaymentWebhookSecret } from './integration'
import { recordOrderCheckoutPayment } from './orderCheckout/service'

export const findCheckoutSession = async (req: PayloadRequest, publicId: string) => {
  const result = await req.payload.find({
    collection: 'checkout-sessions',
    where: { publicId: { equals: publicId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const session = result.docs[0]
  if (!session) {
    throw new APIError('Checkout session not found.', 404)
  }
  return session
}

export const publicCheckoutSession = (session: CheckoutSession) => ({
  sessionId: session.publicId,
  title: session.title,
  status: session.status,
  expiresAt: session.expiresAt,
  amountUsdCents: session.amountUsdCents,
  receiver: session.receiver,
  returnUrl: session.returnUrl,
  settlement: CHECKOUT_SETTLEMENT,
  purchaseData: { nswapSessionId: session.publicId },
  thirdwebClientId: process.env.THIRDWEB_CLIENT_ID,
  paymentRecorded:
    session.kind === 'order' ? Boolean(session.orderRecordedAt) : session.status === 'paid',
})

export const createCheckoutSession = async (req: PayloadRequest, rawBody: string) => {
  if (!process.env.THIRDWEB_CLIENT_ID || !process.env.THIRDWEB_WEBHOOK_SECRET) {
    throw new APIError('The marketplace operator has not configured Thirdweb hosted checkout.', 503)
  }
  const input = createCheckoutSchema.parse(JSON.parse(rawBody))
  const publicCompany = await req.payload.findByID({
    collection: 'companies',
    id: input.companyId,
    depth: 0,
    overrideAccess: false,
    req,
  })
  if (publicCompany._status !== 'published' || publicCompany.isPrivate) {
    throw new APIError('Checkout requires a public, published company.', 400)
  }
  if (!input.productId && !publicCompany.acceptThirdwebDonations) {
    throw new APIError('This company is not accepting Thirdweb donations.', 400)
  }
  const company = await req.payload.db.findOne<Company>({
    collection: 'companies',
    where: { id: { equals: input.companyId } },
    req,
  })
  const signingSecret = await getPaymentWebhookSecret(req, input.companyId)
  if (!company?.paymentWebhookUrl || !signingSecret) {
    throw new APIError('This company has not configured hosted payment notifications.', 400)
  }
  if (input.externalReference || input.returnUrl) {
    verifyPaymentRequest(signingSecret, req.headers, rawBody)
  }
  const product = input.productId
    ? await req.payload.findByID({
        collection: 'products',
        id: input.productId,
        depth: 0,
        overrideAccess: false,
        req,
      })
    : null
  if (
    product &&
    (toStringID(product.company) !== company.id ||
      product._status !== 'published' ||
      !product.orderable)
  ) {
    throw new APIError('The product must be published, orderable, and owned by this company.', 400)
  }
  const price = product ? product.priceInUSD : input.amountUsdCents
  if (
    !price ||
    !Number.isSafeInteger(price) ||
    price < 100 ||
    (product && !product.priceInUSDEnabled)
  ) {
    throw new APIError('A positive USD price of at least $1 is required.', 400)
  }
  const wallet = product?.cryptoAddresses?.address
    ? product.cryptoAddresses
    : company.cryptoAddresses
  if (wallet?.chain !== 'ethereum' || !wallet.address || !isAddress(wallet.address)) {
    throw new APIError('Hosted checkout requires an Ethereum-compatible payout wallet.', 400)
  }
  const quantity = product ? input.quantity : 1
  const amountUsdCents = price * quantity
  if (!Number.isSafeInteger(amountUsdCents) || amountUsdCents > 100_000_000) {
    throw new APIError('Checkout total exceeds the supported limit.', 400)
  }
  const session = await req.payload.create({
    collection: 'checkout-sessions',
    overrideAccess: true,
    depth: 0,
    req,
    data: {
      publicId: randomUUID(),
      company: company.id,
      product: product?.id,
      kind: product ? 'product' : 'donation',
      quantity,
      title: product?.name || `Donation to ${company.name}`,
      amountUsdCents,
      receiver: wallet.address,
      externalReference: input.externalReference,
      returnUrl: input.returnUrl,
      webhookUrl: company.paymentWebhookUrl,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      status: 'pending',
    },
  })
  const checkoutUrl = new URL('/pay', getFrontendURL())
  checkoutUrl.searchParams.set('serverUrl', getServerSideURL())
  checkoutUrl.searchParams.set('session', session.publicId)
  return { ...publicCheckoutSession(session), checkoutUrl: checkoutUrl.href }
}

export const acceptThirdwebPayment = async (req: PayloadRequest, rawBody: string) => {
  const secret = process.env.THIRDWEB_WEBHOOK_SECRET
  if (!secret) {
    throw new APIError('The marketplace operator must configure THIRDWEB_WEBHOOK_SECRET.', 503)
  }
  const headers = Object.fromEntries(req.headers.entries())
  const event = await parseThirdwebPayment(rawBody, headers, secret)
  if (event.data.status !== 'COMPLETED') {
    return { accepted: true, completed: false }
  }
  const reference = z.object({ nswapSessionId: z.uuid() }).safeParse(event.data.purchaseData)
  if (!reference.success) {
    return { accepted: true, completed: false }
  }
  const session = await findCheckoutSession(req, reference.data.nswapSessionId)
  // SDK verification covers both final onchain settlement and direct onramp settlement.
  const verified = await parseThirdwebPayment(rawBody, headers, secret, 300, {
    receiverAddress: session.receiver,
    destinationChainId: CHECKOUT_SETTLEMENT.chainId,
    destinationTokenAddress: CHECKOUT_SETTLEMENT.tokenAddress,
    minDestinationAmount: BigInt(session.amountUsdCents) * 10_000n,
  })
  const onchain = verified.type === 'pay.onchain-transaction'
  const paymentId = onchain ? verified.data.paymentId : verified.data.id
  const amount = onchain ? verified.data.destinationAmount : verified.data.amount
  const transactions = onchain
    ? verified.data.transactions
    : verified.data.transactionHash
      ? [{ chainId: CHECKOUT_SETTLEMENT.chainId, transactionHash: verified.data.transactionHash }]
      : []
  if (!transactions.some((transaction) => transaction.chainId === CHECKOUT_SETTLEMENT.chainId)) {
    throw new APIError('A completed destination transaction is required.', 400)
  }
  const destinationTransactionHash = transactions
    .find((transaction) => transaction.chainId === CHECKOUT_SETTLEMENT.chainId)!
    .transactionHash.toLowerCase()
  if (session.status === 'paid' && session.paymentId !== paymentId) {
    throw new APIError('This checkout already received a different payment.', 409)
  }
  if (session.kind === 'order') {
    const write: UpdateOne = req.payload.db.updateOne.bind(req.payload.db)
    await write({
      collection: 'checkout-sessions',
      where: { and: [{ id: { equals: session.id } }, { status: { equals: 'pending' } }] },
      data: {
        status: 'paid',
        paymentId,
        destinationTransactionHash,
        notification: { rawBody, signatureHeaders: headers },
      },
      req,
    })
    const stored = await findCheckoutSession(req, session.publicId)
    if (!stored.orderRecordedAt) {
      await req.payload.jobs.queue({
        task: 'confirmThirdwebOrder',
        queue: 'notifications',
        input: { sessionId: stored.id },
        req,
      })
      await recordOrderCheckoutPayment(req, stored)
    }
    return { accepted: true, completed: true }
  }
  const now = new Date().toISOString()
  const notification: PaymentNotification = {
    version: 1,
    id: session.publicId,
    type: 'payment.completed',
    createdAt: now,
    serverUrl: getServerSideURL(),
    sessionId: session.publicId,
    companyId: toStringID(session.company)!,
    productId: toStringID(session.product),
    quantity: session.quantity,
    externalReference: session.externalReference || null,
    kind: session.kind,
    requestedAmountUsdCents: session.amountUsdCents,
    settlement: {
      receiver: session.receiver,
      chainId: CHECKOUT_SETTLEMENT.chainId,
      tokenAddress: CHECKOUT_SETTLEMENT.tokenAddress,
      tokenSymbol: CHECKOUT_SETTLEMENT.symbol,
      amount: amount.toString(),
      decimals: CHECKOUT_SETTLEMENT.decimals,
    },
    verification: {
      provider: 'thirdweb',
      verifiedAt: now,
      signatureVerified: true,
      completed: true,
      receiverMatched: true,
      chainMatched: true,
      tokenMatched: true,
      amountSatisfied: true,
    },
    thirdweb: {
      paymentId,
      rawBody,
      transactions,
      signatureHeaders: Object.fromEntries(
        Object.entries(headers).filter(([key]) =>
          ['x-payload-signature', 'x-pay-signature', 'x-timestamp', 'x-pay-timestamp'].includes(
            key,
          ),
        ),
      ),
    },
  }
  const write: UpdateOne = req.payload.db.updateOne.bind(req.payload.db)
  await write({
    collection: 'checkout-sessions',
    where: { and: [{ id: { equals: session.id } }, { status: { equals: 'pending' } }] },
    data: { status: 'paid', paymentId, destinationTransactionHash, notification },
    req,
  })
  const stored = await findCheckoutSession(req, session.publicId)
  if (!stored.deliveredAt) {
    // Replayed provider deliveries also repair a queue failure after payment persistence.
    await req.payload.jobs.queue({
      task: 'deliverPaymentWebhook',
      queue: 'notifications',
      input: { sessionId: stored.id },
      req,
    })
  }
  return { accepted: true, completed: true }
}
