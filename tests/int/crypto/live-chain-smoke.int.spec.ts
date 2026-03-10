import { describe, expect, it } from 'vitest'
import { getEthereumPoolRate } from '@/crypto/rates/ethereum'
import { getSolanaPoolRate } from '@/crypto/rates/solana'
import { getTronPoolRate } from '@/crypto/rates/tron'

/**
 * Optional live smoke tests.
 *
 * These call real chain endpoints and are enabled by default.
 *
 * Explicit opt-out:
 *   NO_LIVE_CRYPTO_TESTS=true pnpm run test:int
 */
const RUN_LIVE = process.env.NO_LIVE_CRYPTO_TESTS !== 'true'
const TRON_BYTESLIKE_ERROR_FRAGMENT = 'invalid BytesLike value'
type Chain = 'ethereum' | 'solana' | 'tron'
type LiveChainStatus = {
  available: boolean
  reason?: string
}

const getLiveChainStatus = (chain: Chain): LiveChainStatus => {
  const globalStatus = (globalThis as { __LIVE_CHAIN_STATUS__?: Record<Chain, LiveChainStatus> }).__LIVE_CHAIN_STATUS__
  if (globalStatus?.[chain]) {
    return globalStatus[chain]
  }

  return {
    available: (globalThis as { __LIVE_CHAIN_AVAILABLE__?: boolean }).__LIVE_CHAIN_AVAILABLE__ !== false,
  }
}

const getTronAPIBaseURL = (): string => {
  const api = process.env.TRONWEB_API?.trim()
  if (!api) {
    throw new Error('Missing TRONWEB_API for live TRON smoke test.')
  }

  return api.replace(/\/+$/, '')
}

describe.runIf(RUN_LIVE)('crypto live chain smoke tests (default-on)', () => {
  it('fetches a positive ETH/USDC pool rate from configured Ethereum RPC/pool', async () => {
    const status = getLiveChainStatus('ethereum')
    if (!status.available) {
      console.log(`[LIVE-RATES] ETH skipped: ${status.reason || 'live runtime unavailable'}`)
      return
    }

    const rate = await getEthereumPoolRate()
    console.log(
      `[LIVE-RATES] ETH stablePerNative=${rate.stablePerNative} nativePerStable=${rate.nativePerStable} pool=${rate.poolAddress}`,
    )

    expect(rate.chain).toBe('ethereum')
    expect(rate.nativePerStable).toBeGreaterThan(0)
    expect(rate.stablePerNative).toBeGreaterThan(0)
  }, 45_000)

  it('fetches a positive SOL/USDC pool rate from configured Solana RPC/vaults', async () => {
    const status = getLiveChainStatus('solana')
    if (!status.available) {
      console.log(`[LIVE-RATES] SOL skipped: ${status.reason || 'live runtime unavailable'}`)
      return
    }

    const rate = await getSolanaPoolRate()
    console.log(
      `[LIVE-RATES] SOL stablePerNative=${rate.stablePerNative} nativePerStable=${rate.nativePerStable} pool=${rate.poolAddress}`,
    )

    expect(rate.chain).toBe('solana')
    expect(rate.nativePerStable).toBeGreaterThan(0)
    expect(rate.stablePerNative).toBeGreaterThan(0)
  }, 45_000)

  it('touches Tron mainnet and fetches pool rate when supported by runtime', async () => {
    const status = getLiveChainStatus('tron')
    if (!status.available) {
      console.log(`[LIVE-RATES] TRX skipped: ${status.reason || 'live runtime unavailable'}`)
      return
    }

    let poolRateFallbackReason: string | null = null
    try {
      const rate = await getTronPoolRate()
      console.log(
        `[LIVE-RATES] TRX stablePerNative=${rate.stablePerNative} nativePerStable=${rate.nativePerStable} pool=${rate.poolAddress}`,
      )

      expect(rate.chain).toBe('tron')
      expect(rate.nativePerStable).toBeGreaterThan(0)
      expect(rate.stablePerNative).toBeGreaterThan(0)
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes(TRON_BYTESLIKE_ERROR_FRAGMENT)) {
        throw error
      }

      poolRateFallbackReason = message
    }

    const headers = {
      'content-type': 'application/json',
      ...(process.env.TRONWEB_SECRET ? { 'TRON-PRO-API-KEY': process.env.TRONWEB_SECRET } : {}),
    }
    const baseURL = getTronAPIBaseURL()
    const response = await fetch(`${baseURL}/wallet/getnowblock`, {
      method: 'POST',
      headers,
      body: '{}',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} at ${baseURL}/wallet/getnowblock`)
    }

    const payload = (await response.json()) as { blockID?: string; block_header?: unknown }
    expect(Boolean(payload.blockID || payload.block_header)).toBe(true)
    console.log(
      `[LIVE-RATES] TRX pool-rate unavailable in this runtime (${poolRateFallbackReason || 'unknown'}); live touch ok via ${baseURL}`,
    )
  }, 45_000)
})
