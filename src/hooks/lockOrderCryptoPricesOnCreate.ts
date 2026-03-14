import type { CollectionBeforeChangeHook } from 'payload'
import BigNumber from 'bignumber.js'
import { buildOrderCryptoPricesFromCache } from '@/crypto/rates/cache'
import { resolveProductPaymentTargetsFromItems } from '@/crypto/recipient'

const unique = <T>(values: T[]): T[] => [...new Set(values)]
const USD_BASE_DIVISOR = 100

type PriceSnapshot = Awaited<ReturnType<typeof buildOrderCryptoPricesFromCache>>[number]

export const lockOrderCryptoPricesOnCreate: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') {
    return data
  }

  const next = { ...(data ?? {}) }
  const orderAmount =
    typeof next.amount === 'number' ? new BigNumber(next.amount).div(USD_BASE_DIVISOR).toNumber() : null
  const paymentTargets = await resolveProductPaymentTargetsFromItems({
    items: next.items,
    payload: req.payload,
    req,
  })
  const chains = unique(paymentTargets.map((target) => target.chain))
  const prices: PriceSnapshot[] = await buildOrderCryptoPricesFromCache({
    orderAmount,
    chains,
    payload: req.payload,
  })

  next.cryptoPrices = prices
  return next
}
