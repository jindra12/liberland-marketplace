import {
  MigrateDownArgs,
  MigrateUpArgs,
} from '@payloadcms/db-mongodb'
import type { ObjectId } from 'mongodb'

type LegacyPriceGroup = {
  amount?: number | string | null
  currency?: string | null
}

type LegacyProductDoc = {
  _id: ObjectId
  id?: string
  name?: string
  price?: LegacyPriceGroup | number | string | null
  currency?: string | null
  priceInUSD?: number | null
  priceInUSDEnabled?: boolean | null
}

const STATIC_USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.1,
  ETH: 1900,
}

const toFiniteAmount = (value: unknown): number | null => {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) {
    return null
  }
  return amount
}

const toLegacyCurrency = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'USD'
  }
  return value.trim().toUpperCase()
}

const resolveLegacyAmountAndCurrency = (doc: LegacyProductDoc): { amount: number; currency: string } | null => {
  if (doc.price && typeof doc.price === 'object') {
    const amount = toFiniteAmount(doc.price.amount)
    if (amount === null) {
      return null
    }

    const currency = toLegacyCurrency(doc.price.currency ?? doc.currency)
    return { amount, currency }
  }

  const scalarAmount = toFiniteAmount(doc.price)
  if (scalarAmount === null) {
    return null
  }

  return {
    amount: scalarAmount,
    currency: toLegacyCurrency(doc.currency),
  }
}

const toUSDCents = (amount: number, currency: string): number | null => {
  const usdRate = STATIC_USD_RATES[currency]
  if (!usdRate) {
    return null
  }

  const usdAmount = amount * usdRate
  return Math.round(usdAmount * 100)
}

export async function up({ payload, req, session }: MigrateUpArgs): Promise<void> {
  const productsCollection = payload.db.collections.products?.collection
  if (!productsCollection) {
    throw new Error('products collection is not available in Mongo adapter.')
  }

  const docs = (await productsCollection
    .find(
      {
        price: { $exists: true },
      },
      {
        session,
        projection: {
          _id: 1,
          id: 1,
          name: 1,
          price: 1,
          currency: 1,
          priceInUSD: 1,
          priceInUSDEnabled: 1,
        },
      },
    )
    .toArray()) as LegacyProductDoc[]

  let updated = 0
  let enabledExistingPrice = 0
  let skippedUnknownCurrency = 0
  let skippedInvalidPrice = 0

  for (const doc of docs) {
    const existingPriceInUSD = Number(doc.priceInUSD)
    if (Number.isFinite(existingPriceInUSD) && existingPriceInUSD >= 0) {
      if (doc.priceInUSDEnabled !== true) {
        await productsCollection.updateOne(
          { _id: doc._id },
          {
            $set: {
              priceInUSDEnabled: true,
            },
          },
          { session },
        )
        enabledExistingPrice += 1
      }
      continue
    }

    const legacy = resolveLegacyAmountAndCurrency(doc)
    if (!legacy) {
      skippedInvalidPrice += 1
      continue
    }

    const cents = toUSDCents(legacy.amount, legacy.currency)
    if (cents === null) {
      skippedUnknownCurrency += 1
      payload.logger.warn(
        `[migration:backfill_product_prices_usd] Skipped product ${doc.id ?? String(doc._id)} with unsupported legacy currency "${legacy.currency}".`,
      )
      continue
    }

    await productsCollection.updateOne(
      { _id: doc._id },
      {
        $set: {
          priceInUSD: cents,
          priceInUSDEnabled: true,
        },
      },
      { session },
    )

    updated += 1
  }

  payload.logger.info(
    `[migration:backfill_product_prices_usd] Completed. scanned=${docs.length} updated=${updated} enabledExistingPrice=${enabledExistingPrice} skippedInvalidPrice=${skippedInvalidPrice} skippedUnknownCurrency=${skippedUnknownCurrency}`,
  )
}

export async function down({ payload, req, session }: MigrateDownArgs): Promise<void> {
  req
  session
  payload.logger.info(
    '[migration:backfill_product_prices_usd] down() is a no-op. No automatic rollback for converted USD prices.',
  )
}
