import { verifyTransactionOccurred } from '@/crypto'
import { normalizeTransactionHash } from '@/crypto/hash'
import { resolveProductIDsForItems, resolveProductPaymentTargetsFromItems } from '@/crypto/recipient'
import type { SupportedChain } from '@/crypto/types'
import type { GroupField, PayloadRequest } from 'payload'

type NormalizedCartItem = {
  product?: string
  quantity: number
  variant?: string
}

type ConfirmInput = {
  cartID: string
  customerEmail?: string
  explicitTransactionHashes: ConfirmTransactionHashEntry[]
  fallbackChain?: SupportedChain
  payerAddress?: string
  fallbackTransactionHash?: string
  transactionID?: string
}

type ConfirmTransactionHashEntry = {
  chain: SupportedChain
  productID: string
  transactionHash: string
}

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

const CHAIN_ALIASES: Record<string, SupportedChain> = {
  eth: 'ethereum',
  ethereum: 'ethereum',
  sol: 'solana',
  solana: 'solana',
  tron: 'tron',
  trx: 'tron',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const toDocID = (value: unknown): string | null => {
  if (typeof value === 'string' || typeof value === 'number') {
    const id = String(value).trim()
    return id.length > 0 ? id : null
  }

  if (isRecord(value)) {
    return toDocID(value.id)
  }

  return null
}

const normalizeChain = (value: unknown): SupportedChain | null => {
  const raw = asNonEmptyString(value)
  if (!raw) {
    return null
  }

  return CHAIN_ALIASES[raw.toLowerCase()] ?? null
}

const extractCartIDFromUser = (req: PayloadRequest): string | null => {
  if (!isRecord(req.user) || !isRecord(req.user.cart)) {
    return null
  }

  const docs = req.user.cart.docs
  if (!Array.isArray(docs) || docs.length === 0) {
    return null
  }

  return toDocID(docs[0])
}

const parseConfirmInput = (data: Record<string, unknown>): ConfirmInput => {
  const cryptoData = isRecord(data.crypto) ? data.crypto : null

  const cartID = asNonEmptyString(data.cartID ?? data.cartId)
  if (!cartID) {
    throw new Error('cartID is required to confirm a crypto order.')
  }

  const explicitTransactionHashesRaw = Array.isArray(data.transactionHashes) ? data.transactionHashes : []
  const explicitTransactionHashes = explicitTransactionHashesRaw
    .map((entry, index): ConfirmTransactionHashEntry => {
      if (!isRecord(entry)) {
        throw new Error(`transactionHashes[${index}] must be an object.`)
      }

      const productID = toDocID(entry.productID ?? entry.product)
      if (!productID) {
        throw new Error(`transactionHashes[${index}].product is required.`)
      }

      const chain = normalizeChain(entry.chain ?? entry.network)
      if (!chain) {
        throw new Error(`transactionHashes[${index}].chain must be ethereum, solana, or tron.`)
      }

      const transactionHashRaw = asNonEmptyString(entry.transactionHash ?? entry.txHash)
      if (!transactionHashRaw) {
        throw new Error(`transactionHashes[${index}].transactionHash is required.`)
      }

      return {
        chain,
        productID,
        transactionHash: normalizeTransactionHash(transactionHashRaw, chain),
      }
    })

  const fallbackChain = normalizeChain(data.chain ?? data.network ?? cryptoData?.chain)
  const fallbackTransactionHashRaw =
    asNonEmptyString(data.transactionHash) ??
    asNonEmptyString(data.txHash) ??
    asNonEmptyString(cryptoData?.transactionHash) ??
    asNonEmptyString(cryptoData?.txHash)

  if (explicitTransactionHashes.length === 0 && (!fallbackChain || !fallbackTransactionHashRaw)) {
    throw new Error(
      'Provide either transactionHashes[] with { product, chain, transactionHash } entries, or a single chain + transactionHash.',
    )
  }

  return {
    cartID,
    customerEmail: asNonEmptyString(data.customerEmail) ?? undefined,
    explicitTransactionHashes,
    fallbackChain: fallbackChain ?? undefined,
    payerAddress: asNonEmptyString(data.payerAddress) ?? undefined,
    fallbackTransactionHash:
      fallbackChain && fallbackTransactionHashRaw
        ? normalizeTransactionHash(fallbackTransactionHashRaw, fallbackChain)
        : undefined,
    transactionID: asNonEmptyString(data.transactionID) ?? undefined,
  }
}

const buildTransactionHashEntries = ({
  fallbackChain,
  fallbackTransactionHash,
  explicitEntries,
  productIDs,
}: {
  fallbackChain?: SupportedChain
  fallbackTransactionHash?: string
  explicitEntries: ConfirmTransactionHashEntry[]
  productIDs: string[]
}): ConfirmTransactionHashEntry[] => {
  if (explicitEntries.length === 0) {
    if (!fallbackChain || !fallbackTransactionHash) {
      throw new Error('Missing fallback chain/transaction hash for order confirmation.')
    }

    return productIDs.map((productID) => ({
      chain: fallbackChain,
      productID,
      transactionHash: fallbackTransactionHash,
    }))
  }

  const validProductIDs = new Set(productIDs)
  const assignedProductIDs = new Set<string>()

  for (const entry of explicitEntries) {
    if (!validProductIDs.has(entry.productID)) {
      throw new Error(`Transaction entry references product ${entry.productID}, which is not present in the cart.`)
    }

    if (assignedProductIDs.has(entry.productID)) {
      throw new Error(`Product ${entry.productID} appears more than once in transactionHashes.`)
    }

    assignedProductIDs.add(entry.productID)
  }

  if (assignedProductIDs.size !== validProductIDs.size) {
    const missing = productIDs.filter((productID) => !assignedProductIDs.has(productID))
    throw new Error(`Missing transaction hash entry for cart products: ${missing.join(', ')}`)
  }

  return explicitEntries
}

const unique = <T>(values: T[]): T[] => [...new Set(values)]

const toNormalizedCartItems = (rawItems: unknown): NormalizedCartItem[] => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('Cart must contain at least one item.')
  }

  return rawItems.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Cart item at index ${index} is invalid.`)
    }

    const quantity = Number(item.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Cart item at index ${index} has invalid quantity.`)
    }

    const productID = toDocID(item.product)
    const variantID = toDocID(item.variant)
    if (!productID && !variantID) {
      throw new Error(`Cart item at index ${index} has neither product nor variant.`)
    }

    return {
      ...(productID ? { product: productID } : {}),
      ...(variantID ? { variant: variantID } : {}),
      quantity,
    }
  })
}

const buildVerificationErrorMessage = (
  result: Awaited<ReturnType<typeof verifyTransactionOccurred>>,
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

const upsertTransaction = async ({
  amount,
  cartID,
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
  transactionsSlug,
}: {
  amount: number | null
  cartID: string
  currency: string
  customer: string | null
  customerEmail: string
  items: NormalizedCartItem[]
  orderID: string
  paymentRef: string
  req: PayloadRequest
  status: 'failed' | 'succeeded'
  transactionHashReference: string
  transactionID?: string
  transactionsSlug: string
}): Promise<{ id: string }> => {
  const data = {
    amount,
    cart: cartID,
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
    const existingTransaction = await req.payload
      .findByID({
        collection: transactionsSlug as any,
        id: transactionID,
        depth: 0,
        req,
      })
      .catch(() => null)

    if (existingTransaction) {
      return req.payload.update({
        collection: transactionsSlug as any,
        id: transactionID,
        data,
        req,
      }) as Promise<{ id: string }>
    }
  }

  return req.payload.create({
    collection: transactionsSlug as any,
    data,
    req,
  }) as Promise<{ id: string }>
}

export const cryptoAdapter = () => ({
  initiatePayment: async (_args: InitiatePaymentArgs) => {
    return {
      message:
        'Crypto payment initiated. Confirm with transactionHashes[] ({ product, chain, transactionHash }) or fallback chain + transactionHash.',
    }
  },

  confirmOrder: async ({
    cartsSlug = 'carts',
    data,
    ordersSlug = 'orders',
    req,
    transactionsSlug = 'transactions',
  }: ConfirmOrderArgs) => {
    const payloadData = isRecord(data) ? data : {}
    const userCartID = extractCartIDFromUser(req)
    if (!payloadData.cartID && !payloadData.cartId && userCartID) {
      payloadData.cartID = userCartID
    }

    const input = parseConfirmInput(payloadData)

    const cart = await req.payload.findByID({
      collection: cartsSlug as any,
      id: input.cartID,
      depth: 2,
      overrideAccess: false,
      req,
      select: {
        currency: true,
        customer: true,
        id: true,
        items: true,
        subtotal: true,
      },
    })

    if (!cart) {
      throw new Error(`Cart ${input.cartID} was not found.`)
    }

    const rawItems = Array.isArray((cart as Record<string, unknown>).items)
      ? ((cart as Record<string, unknown>).items as unknown[])
      : []
    const items = toNormalizedCartItems(rawItems)
    const productIDs = await resolveProductIDsForItems({
      items: rawItems,
      payload: req.payload as any,
      req,
    })

    const transactionHashEntries = buildTransactionHashEntries({
      explicitEntries: input.explicitTransactionHashes,
      fallbackChain: input.fallbackChain,
      fallbackTransactionHash: input.fallbackTransactionHash,
      productIDs,
    })

    const paymentTargets = await resolveProductPaymentTargetsFromItems({
      items: rawItems,
      payload: req.payload as any,
      req,
    })
    const paymentTargetByProductID = new Map(paymentTargets.map((target) => [target.productID, target]))

    const paymentRef = unique(
      transactionHashEntries.map((entry) => {
        const target = paymentTargetByProductID.get(entry.productID)
        if (!target) {
          throw new Error(`Missing payout target for product ${entry.productID}.`)
        }

        if (target.chain !== entry.chain) {
          throw new Error(
            `Product ${entry.productID} expects ${target.chain} payout, but transaction entry uses ${entry.chain}.`,
          )
        }

        return `${entry.chain}:${target.recipientAddress}`
      }),
    ).join(' | ')

    const transactionHashReference = unique(transactionHashEntries.map((entry) => entry.transactionHash)).join(',')

    const customerID = toDocID((cart as Record<string, unknown>).customer) ?? toDocID(req.user)
    const customerEmail = input.customerEmail ?? asNonEmptyString(req.user?.email)

    if (!customerEmail) {
      throw new Error('Customer email is required to confirm the order.')
    }

    const subtotal = Number((cart as Record<string, unknown>).subtotal)
    const amount = Number.isFinite(subtotal) ? subtotal : null
    const currency = asNonEmptyString((cart as Record<string, unknown>).currency) ?? 'USD'

    const order = (await req.payload.create({
      collection: ordersSlug as any,
      data: {
        amount,
        currency,
        customer: customerID,
        customerEmail,
        items,
        payerAddress: input.payerAddress,
        status: 'processing',
        transactionHashes: transactionHashEntries.map((entry) => ({
          chain: entry.chain,
          product: entry.productID,
          transactionHash: entry.transactionHash,
        })),
      },
      req,
    })) as { id: string }

    const verification = await verifyTransactionOccurred(order.id)
    const verificationPassed = verification.ok

    const transaction = await upsertTransaction({
      amount,
      cartID: input.cartID,
      currency,
      customer: customerID,
      customerEmail,
      items,
      orderID: order.id,
      paymentRef,
      req,
      status: verificationPassed ? 'succeeded' : 'failed',
      transactionHashReference,
      transactionID: input.transactionID,
      transactionsSlug,
    })

    await req.payload.update({
      collection: ordersSlug as any,
      id: order.id,
      data: {
        status: verificationPassed ? 'completed' : 'cancelled',
        transactions: [transaction.id],
      },
      req,
    })

    if (!verificationPassed) {
      throw new Error(buildVerificationErrorMessage(verification))
    }

    await req.payload.update({
      collection: cartsSlug as any,
      id: input.cartID,
      data: {
        purchasedAt: new Date().toISOString(),
      },
      overrideAccess: false,
      req,
    })

    return {
      message: 'Crypto order confirmed.',
      orderID: order.id,
      transactionID: transaction.id,
    }
  },
  name: 'crypto',
  group,
})
