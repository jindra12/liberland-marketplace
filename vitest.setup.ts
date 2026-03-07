// Any setup scripts you might need go here

// Load .env files
import 'dotenv/config'
import { beforeAll } from 'vitest'

const skipLiveChainChecks = process.env.NO_LIVE_CRYPTO_TESTS === 'true'
const requireLiveChainChecks = process.env.REQUIRE_LIVE_CRYPTO_TESTS === 'true'

type Chain = 'ethereum' | 'solana' | 'tron'
type LiveChainStatus = {
  available: boolean
  reason?: string
}

type LiveChainGlobals = {
  __LIVE_CHAIN_AVAILABLE__?: boolean
  __LIVE_CHAIN_STATUS__?: Record<Chain, LiveChainStatus>
}

const createDefaultStatus = (available: boolean, reason?: string): Record<Chain, LiveChainStatus> => ({
  ethereum: { available, reason },
  solana: { available, reason },
  tron: { available, reason },
})

const liveChainGlobals = globalThis as LiveChainGlobals
liveChainGlobals.__LIVE_CHAIN_AVAILABLE__ = !skipLiveChainChecks
liveChainGlobals.__LIVE_CHAIN_STATUS__ = createDefaultStatus(!skipLiveChainChecks)

const getEnv = (...names: string[]): string => {
  for (const name of names) {
    const value = process.env[name]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  throw new Error(`Missing required environment variable. Expected one of: ${names.join(', ')}`)
}

const fetchJSON = async (url: string, init: RequestInit): Promise<unknown> => {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} at ${url}`)
  }

  return response.json()
}

const touchEthereum = async () => {
  const rpcURL = getEnv('CRYPTO_ETH_RPC_URL', 'ETH_RPC_URL')
  const response = (await fetchJSON(rpcURL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_blockNumber',
      params: [],
    }),
  })) as { result?: string }

  if (typeof response.result !== 'string' || !response.result.startsWith('0x')) {
    throw new Error('Ethereum live-touch check returned an unexpected payload.')
  }
}

const touchSolana = async () => {
  const rpcURL = getEnv('CRYPTO_SOL_RPC_URL', 'SOLANA_NET')
  const response = (await fetchJSON(rpcURL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: 1,
      jsonrpc: '2.0',
      method: 'getSlot',
      params: [{ commitment: 'confirmed' }],
    }),
  })) as { result?: number }

  if (typeof response.result !== 'number' || response.result <= 0) {
    throw new Error('Solana live-touch check returned an unexpected payload.')
  }
}

const touchTron = async () => {
  const fullNodeURL = getEnv('TRONWEB_FULLNODE', 'TRONWEB_API').replace(/\/+$/, '')
  const apiURL = process.env.TRONWEB_API?.trim().replace(/\/+$/, '')
  const proApiKey = process.env.TRONWEB_SECRET?.trim()
  const headers = {
    'content-type': 'application/json',
    ...(proApiKey ? { 'TRON-PRO-API-KEY': proApiKey } : {}),
  }

  const candidateURLs = Array.from(new Set([fullNodeURL, apiURL].filter(Boolean) as string[]))
  const errors: string[] = []

  for (const baseURL of candidateURLs) {
    try {
      const response = (await fetchJSON(`${baseURL}/wallet/getnowblock`, {
        method: 'POST',
        headers,
        body: '{}',
      })) as { blockID?: string; block_header?: unknown }

      if (typeof response.blockID !== 'string' && !response.block_header) {
        throw new Error('Tron live-touch check returned an unexpected payload.')
      }

      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${baseURL}: ${message}`)
    }
  }

  if (errors.length === 0) {
    throw new Error('Tron live-touch check failed: no configured endpoints.')
  }

  throw new Error(`Tron live-touch check failed across endpoints: ${errors.join(' | ')}`)
}

/**
 * By default all integration tests touch live chains at least once.
 *
 * Set NO_LIVE_CRYPTO_TESTS=true to explicitly opt out (for offline/CI workflows).
 */
beforeAll(async () => {
  if (skipLiveChainChecks) {
    liveChainGlobals.__LIVE_CHAIN_AVAILABLE__ = false
    liveChainGlobals.__LIVE_CHAIN_STATUS__ = createDefaultStatus(false, 'opted out with NO_LIVE_CRYPTO_TESTS=true')
    return
  }

  const checks: Record<Chain, () => Promise<void>> = {
    ethereum: touchEthereum,
    solana: touchSolana,
    tron: touchTron,
  }

  const entries = Object.entries(checks) as Array<[Chain, () => Promise<void>]>
  const statuses = {} as Record<Chain, LiveChainStatus>

  await Promise.all(
    entries.map(async ([chain, run]) => {
      try {
        await run()
        statuses[chain] = { available: true }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        statuses[chain] = { available: false, reason }
      }
    }),
  )

  liveChainGlobals.__LIVE_CHAIN_STATUS__ = statuses
  liveChainGlobals.__LIVE_CHAIN_AVAILABLE__ = entries.some(([chain]) => statuses[chain]?.available)

  const failed = entries.filter(([chain]) => !statuses[chain]?.available).map(([chain]) => ({ chain, ...statuses[chain] }))

  if (failed.length === 0) {
    return
  }

  const message = failed.map(({ chain, reason }) => `${chain}: ${reason || 'unknown error'}`).join(' | ')

  if (requireLiveChainChecks) {
    throw new Error(`[vitest.setup] Live chain checks required, but failed: ${message}`)
  }

  // eslint-disable-next-line no-console
  console.warn(`[vitest.setup] Some live chain checks unavailable, continuing: ${message}`)
}, 60_000)
