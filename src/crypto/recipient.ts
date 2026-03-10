import { PublicKey } from '@solana/web3.js'
import BigNumber from 'bignumber.js'
import type { Payload, PayloadRequest } from 'payload'
import { normalizeEthereumAddress } from './ethereum'
import { normalizeTronAddress } from './tron'
import type { SupportedChain } from './types'

type PayloadLike = Pick<Payload, 'findByID'>
type WalletCollection = 'companies' | 'products' | 'variants'

type ProductWalletDoc = {
  company?: unknown
  cryptoAddresses?: unknown
  priceInUSD?: unknown
  priceInUSDEnabled?: unknown
}

type CompanyWalletDoc = {
  cryptoAddresses?: unknown
}

type VariantWalletDoc = {
  product?: unknown
}

type ResolvedWallet = {
  address: string
  chain: SupportedChain
}

const USD_BASE_DIVISOR = 100

export type ProductPaymentTarget = {
  chain: SupportedChain
  normalizedRecipientAddress: string
  productID: string
  quantity: number
  recipientAddress: string
  stableAmount: number
  unitAmount: number
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

const isSupportedChain = (chain: unknown): chain is SupportedChain =>
  chain === 'ethereum' || chain === 'solana' || chain === 'tron'

const parseWallet = (value: unknown): ResolvedWallet | null => {
  if (!isRecord(value)) {
    return null
  }

  const chain = value.chain
  const address = asNonEmptyString(value.address)

  if (!isSupportedChain(chain) || !address) {
    return null
  }

  return {
    address,
    chain,
  }
}

const normalizeAddressForComparison = ({
  address,
  chain,
}: {
  address: string
  chain: SupportedChain
}): string => {
  if (chain === 'ethereum') {
    return normalizeEthereumAddress(address)
  }

  if (chain === 'solana') {
    return new PublicKey(address).toBase58()
  }

  return normalizeTronAddress(address)
}

const findByID = async ({
  collection,
  id,
  payload,
  req,
}: {
  collection: WalletCollection
  id: string
  payload: PayloadLike
  req?: PayloadRequest
}) => {
  return payload.findByID({
    collection,
    id,
    depth: 0,
    ...(req ? { req, overrideAccess: false } : {}),
  })
}

const loadVariant = async ({
  cache,
  payload,
  req,
  variantID,
}: {
  cache: Map<string, VariantWalletDoc>
  payload: PayloadLike
  req?: PayloadRequest
  variantID: string
}): Promise<VariantWalletDoc> => {
  const cached = cache.get(variantID)
  if (cached) {
    return cached
  }

  const variant = (await findByID({
    collection: 'variants',
    id: variantID,
    payload,
    req,
  })) as VariantWalletDoc

  cache.set(variantID, variant)
  return variant
}

const loadProduct = async ({
  cache,
  payload,
  productID,
  req,
}: {
  cache: Map<string, ProductWalletDoc>
  payload: PayloadLike
  productID: string
  req?: PayloadRequest
}): Promise<ProductWalletDoc> => {
  const cached = cache.get(productID)
  if (cached) {
    return cached
  }

  const product = (await findByID({
    collection: 'products',
    id: productID,
    payload,
    req,
  })) as ProductWalletDoc

  cache.set(productID, product)
  return product
}

const loadCompany = async ({
  cache,
  companyID,
  payload,
  req,
}: {
  cache: Map<string, CompanyWalletDoc>
  companyID: string
  payload: PayloadLike
  req?: PayloadRequest
}): Promise<CompanyWalletDoc> => {
  const cached = cache.get(companyID)
  if (cached) {
    return cached
  }

  const company = (await findByID({
    collection: 'companies',
    id: companyID,
    payload,
    req,
  })) as CompanyWalletDoc

  cache.set(companyID, company)
  return company
}

const resolveProductIDFromItem = async ({
  item,
  payload,
  req,
  variantCache,
}: {
  item: unknown
  payload: PayloadLike
  req?: PayloadRequest
  variantCache: Map<string, VariantWalletDoc>
}): Promise<string | null> => {
  if (!isRecord(item)) {
    return null
  }

  const directProductID = toDocID(item.product)
  if (directProductID) {
    return directProductID
  }

  const variantID = toDocID(item.variant)
  if (!variantID) {
    return null
  }

  const variant = await loadVariant({
    cache: variantCache,
    payload,
    req,
    variantID,
  })

  return toDocID(variant.product)
}

const resolveWalletForProduct = async ({
  companyCache,
  payload,
  product,
  req,
}: {
  companyCache: Map<string, CompanyWalletDoc>
  payload: PayloadLike
  product: ProductWalletDoc
  req?: PayloadRequest
}): Promise<ResolvedWallet | null> => {
  const productWallet = parseWallet(product.cryptoAddresses)
  if (productWallet) {
    return productWallet
  }

  const companyID = toDocID(product.company)
  if (!companyID) {
    return null
  }

  const company = await loadCompany({
    cache: companyCache,
    companyID,
    payload,
    req,
  })

  return parseWallet(company.cryptoAddresses)
}

const getProductUnitAmount = (product: ProductWalletDoc): number | null => {
  if (product.priceInUSDEnabled !== true) {
    return null
  }

  const amount = Number(product.priceInUSD)

  if (!Number.isFinite(amount) || amount <= 0) {
    return null
  }

  return new BigNumber(amount).div(USD_BASE_DIVISOR).toNumber()
}

export const resolveProductIDsForItems = async ({
  items,
  payload,
  req,
}: {
  items: unknown
  payload: PayloadLike
  req?: PayloadRequest
}): Promise<string[]> => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('No order/cart items available to resolve products.')
  }

  const variantCache = new Map<string, VariantWalletDoc>()
  const seenProductIDs = new Set<string>()
  const productIDs: string[] = []

  for (let index = 0; index < items.length; index += 1) {
    const productID = await resolveProductIDFromItem({
      item: items[index],
      payload,
      req,
      variantCache,
    })

    if (!productID) {
      throw new Error(`Item at index ${index} has neither product nor variant reference.`)
    }

    if (!seenProductIDs.has(productID)) {
      seenProductIDs.add(productID)
      productIDs.push(productID)
    }
  }

  return productIDs
}

export const resolveProductPaymentTargetsFromItems = async ({
  items,
  payload,
  req,
}: {
  items: unknown
  payload: PayloadLike
  req?: PayloadRequest
}): Promise<ProductPaymentTarget[]> => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('No order/cart items available to resolve payout recipients.')
  }

  const variantCache = new Map<string, VariantWalletDoc>()
  const productCache = new Map<string, ProductWalletDoc>()
  const companyCache = new Map<string, CompanyWalletDoc>()
  const paymentByProductID = new Map<string, ProductPaymentTarget>()

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (!isRecord(item)) {
      throw new Error(`Item at index ${index} is invalid.`)
    }

    const quantity = Number(item.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Item at index ${index} has invalid quantity.`)
    }

    const productID = await resolveProductIDFromItem({
      item,
      payload,
      req,
      variantCache,
    })

    if (!productID) {
      throw new Error(`Item at index ${index} has neither product nor variant reference.`)
    }

    const product = await loadProduct({
      cache: productCache,
      payload,
      productID,
      req,
    })

    const unitAmount = getProductUnitAmount(product)
    if (unitAmount === null) {
      throw new Error(`Product ${productID} must have Enable USD price turned on with a valid numeric priceInUSD.`)
    }

    const wallet = await resolveWalletForProduct({
      companyCache,
      payload,
      product,
      req,
    })

    if (!wallet) {
      throw new Error(`Missing payout wallet for product ${productID}. Set product wallet or fallback company wallet.`)
    }

    const normalizedRecipientAddress = normalizeAddressForComparison({
      address: wallet.address,
      chain: wallet.chain,
    })

    const stableAmount = unitAmount * quantity
    const existing = paymentByProductID.get(productID)

    if (existing) {
      if (
        existing.chain !== wallet.chain ||
        existing.normalizedRecipientAddress !== normalizedRecipientAddress
      ) {
        throw new Error(`Product ${productID} resolved to inconsistent payout wallets within the same order.`)
      }

      existing.quantity += quantity
      existing.stableAmount += stableAmount
      continue
    }

    paymentByProductID.set(productID, {
      chain: wallet.chain,
      normalizedRecipientAddress,
      productID,
      quantity,
      recipientAddress: wallet.address,
      stableAmount,
      unitAmount,
    })
  }

  return Array.from(paymentByProductID.values())
}

export const resolveRecipientAddressForItems = async ({
  chain,
  items,
  payload,
  req,
}: {
  chain: SupportedChain
  items: unknown
  payload: PayloadLike
  req?: PayloadRequest
}): Promise<string> => {
  const recipients = await resolveRecipientAddressesForItems({
    chain,
    items,
    payload,
    req,
  })

  return recipients[0]
}

export const resolveRecipientAddressesForItems = async ({
  chain,
  items,
  payload,
  req,
}: {
  chain: SupportedChain
  items: unknown
  payload: PayloadLike
  req?: PayloadRequest
}): Promise<string[]> => {
  const productTargets = await resolveProductPaymentTargetsFromItems({
    items,
    payload,
    req,
  })

  const recipientsByNormalizedAddress = new Map<string, string>()

  for (const target of productTargets) {
    if (target.chain !== chain) {
      continue
    }

    if (!recipientsByNormalizedAddress.has(target.normalizedRecipientAddress)) {
      recipientsByNormalizedAddress.set(target.normalizedRecipientAddress, target.recipientAddress)
    }
  }

  if (recipientsByNormalizedAddress.size === 0) {
    throw new Error(`No ${chain} payout wallets were resolved from this order/cart.`)
  }

  return Array.from(recipientsByNormalizedAddress.values())
}
