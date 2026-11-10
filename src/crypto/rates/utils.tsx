import { createHash } from 'node:crypto'
import type { getEthereumRateConfig, getSolanaRateConfig, getTronRateConfig } from '../env'
import type { ChainPoolRate } from '../types'
import {
  RATE_MAX_DEVIATION,
  RATE_OBSERVATION_INTERVAL_MS,
  RATE_OBSERVATION_MAX_AGE_MS,
  RATE_OBSERVATION_MAX_GAP_MS,
  RATE_OBSERVATION_WINDOW_MS,
} from './constants'

/** A changed pool, token/vault configuration or RPC starts a new observation window. */
export const getRateSourceId = (
  config:
    | ReturnType<typeof getEthereumRateConfig>
    | ReturnType<typeof getSolanaRateConfig>
    | ReturnType<typeof getTronRateConfig>,
): string => createHash('sha256').update(JSON.stringify(config)).digest('hex')

export const assertFreshReserveTimestamp = (timestampSeconds: number): void => {
  const age = Date.now() - timestampSeconds * 1000
  if (!Number.isFinite(age) || age < 0 || age > RATE_OBSERVATION_MAX_AGE_MS) {
    throw new Error('Pool reserve observation is stale or has an invalid timestamp.')
  }
}

export const isFreshPoolRate = (rate: ChainPoolRate, maxAgeMs: number): boolean => {
  const age = Date.now() - rate.fetchedAt
  return (
    Number.isFinite(age) &&
    age >= 0 &&
    age <= maxAgeMs &&
    Number.isFinite(rate.stablePerNative) &&
    rate.stablePerNative > 0 &&
    Number.isFinite(rate.nativePerStable) &&
    rate.nativePerStable > 0
  )
}

export const observePoolRate = (rate: ChainPoolRate, previous: ChainPoolRate[]) => {
  if (!isFreshPoolRate(rate, RATE_OBSERVATION_MAX_AGE_MS)) {
    throw new Error('Cannot record a stale or invalid pool rate.')
  }
  const matching = previous.filter(
    (sample) =>
      sample.sourceId === rate.sourceId &&
      sample.poolAddress === rate.poolAddress &&
      sample.fetchedAt <= rate.fetchedAt &&
      sample.fetchedAt >= rate.fetchedAt - RATE_OBSERVATION_WINDOW_MS * 2,
  )
  const last = matching.at(-1)
  const history =
    last && rate.fetchedAt - last.fetchedAt <= RATE_OBSERVATION_MAX_GAP_MS ? matching : []
  if (
    history.length &&
    last &&
    Math.abs(rate.stablePerNative / last.stablePerNative - 1) > RATE_MAX_DEVIATION
  ) {
    return { observations: history, rate: null }
  }
  // Do not let request volume create the appearance of a time-spanning history.
  const observations =
    history.length && last && rate.fetchedAt - last.fetchedAt < RATE_OBSERVATION_INTERVAL_MS
      ? history
      : [...history, rate]
  const first = observations[0]
  const ready =
    first &&
    rate.fetchedAt - first.fetchedAt >= RATE_OBSERVATION_WINDOW_MS &&
    observations.length >= 4 &&
    observations.every(
      (sample, index) =>
        index === 0 ||
        sample.fetchedAt - observations[index - 1].fetchedAt <= RATE_OBSERVATION_MAX_GAP_MS,
    )
  if (!ready) {
    return { observations, rate: null }
  }
  const duration = rate.fetchedAt - first.fetchedAt
  const weightedPrice = observations.reduce((sum, sample, index) => {
    const nextTime = observations[index + 1]?.fetchedAt ?? rate.fetchedAt
    return sum + (sample.stablePerNative * (nextTime - sample.fetchedAt)) / duration
  }, 0)
  if (Math.abs(rate.stablePerNative / weightedPrice - 1) > RATE_MAX_DEVIATION) {
    // Never allow a rejected outlier to move the baseline on the next refresh.
    return { observations: history, rate: null }
  }
  return {
    observations,
    rate: { ...rate, stablePerNative: weightedPrice, nativePerStable: 1 / weightedPrice },
  }
}
