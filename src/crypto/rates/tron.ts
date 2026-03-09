import { getTronRateConfig } from '../env'
import { computePoolRate } from '../math'
import { normalizeTronAddress } from '../tron'
import type { ChainPoolRate } from '../types'

type TriggerConstantResponse = {
  Error?: string
  constant_result?: unknown
  result?: {
    message?: string
    result?: boolean
  }
}

const WORD_HEX_LENGTH = 64
const HEX_PREFIX_RE = /^0x/
const MESSAGE_HEX_RE = /^[0-9a-fA-F]+$/
const TRON_RATE_CALLER_ADDRESS_HEX = '410000000000000000000000000000000000000000'
const TRAILING_SLASH_RE = /\/+$/

const stripHexPrefix = (value: string): string => value.replace(HEX_PREFIX_RE, '')
const trimTrailingSlashes = (value: string): string => value.replace(TRAILING_SLASH_RE, '')

const decodeTronErrorMessage = (message: string): string => {
  const raw = stripHexPrefix(message)
  if (raw.length === 0 || !MESSAGE_HEX_RE.test(raw)) {
    return message
  }

  try {
    return Buffer.from(raw, 'hex').toString('utf8')
  } catch {
    return message
  }
}

const getConstantResultHex = (response: TriggerConstantResponse, method: string): string => {
  if (response.Error) {
    throw new Error(`TRON constant call ${method} failed: ${response.Error}`)
  }

  if (response.result?.result === false) {
    const message = response.result.message ? decodeTronErrorMessage(response.result.message) : 'unknown TRON error'
    throw new Error(`TRON constant call ${method} returned failure: ${message}`)
  }

  const constantResult = response.constant_result
  const firstValue = Array.isArray(constantResult) ? constantResult[0] : undefined
  if (typeof firstValue !== 'string' || firstValue.trim().length === 0) {
    throw new Error(`TRON constant call ${method} returned no constant_result payload.`)
  }

  const normalized = stripHexPrefix(firstValue.trim())
  if (!MESSAGE_HEX_RE.test(normalized)) {
    throw new Error(`TRON constant call ${method} returned non-hex payload.`)
  }

  return normalized
}

const decodeAddressFromWord = (resultHex: string, method: string): string => {
  if (resultHex.length < WORD_HEX_LENGTH) {
    throw new Error(`TRON constant call ${method} returned too-short payload.`)
  }

  const addressHex = resultHex.slice(resultHex.length - 40)
  return `0x${addressHex}`
}

const decodeUintFromWord = (resultHex: string, index: number, method: string): bigint => {
  const start = index * WORD_HEX_LENGTH
  const end = start + WORD_HEX_LENGTH
  const chunk = resultHex.slice(start, end)

  if (chunk.length !== WORD_HEX_LENGTH) {
    throw new Error(`TRON constant call ${method} did not include word index ${index}.`)
  }

  return BigInt(`0x${chunk}`)
}

const callTronConstantMethod = async ({
  contractAddressHex,
  endpoint,
  functionSelector,
  proApiKey,
}: {
  contractAddressHex: string
  endpoint: string
  functionSelector: string
  proApiKey?: string
}): Promise<TriggerConstantResponse> => {
  const headers = {
    'content-type': 'application/json',
    ...(proApiKey ? { 'TRON-PRO-API-KEY': proApiKey } : {}),
  }

  const response = await fetch(`${endpoint}/wallet/triggerconstantcontract`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      owner_address: TRON_RATE_CALLER_ADDRESS_HEX,
      contract_address: contractAddressHex,
      function_selector: functionSelector,
      visible: false,
    }),
  })

  if (!response.ok) {
    throw new Error(`TRON constant call ${functionSelector} failed at ${endpoint}: HTTP ${response.status}`)
  }

  const payload = (await response.json()) as TriggerConstantResponse
  getConstantResultHex(payload, functionSelector)
  return payload
}

export const getTronPoolRate = async (): Promise<ChainPoolRate> => {
  const config = getTronRateConfig()
  const poolAddressForCalls = normalizeTronAddress(config.poolAddress)
  const endpoint = trimTrailingSlashes(config.apiUrl)

  const [token0Result, token1Result, reservesResult] = await Promise.all([
    callTronConstantMethod({
      contractAddressHex: poolAddressForCalls,
      endpoint,
      functionSelector: 'token0()',
      proApiKey: config.proApiKey,
    }),
    callTronConstantMethod({
      contractAddressHex: poolAddressForCalls,
      endpoint,
      functionSelector: 'token1()',
      proApiKey: config.proApiKey,
    }),
    callTronConstantMethod({
      contractAddressHex: poolAddressForCalls,
      endpoint,
      functionSelector: 'getReserves()',
      proApiKey: config.proApiKey,
    }),
  ])

  const token0 = decodeAddressFromWord(getConstantResultHex(token0Result, 'token0()'), 'token0()')
  const token1 = decodeAddressFromWord(getConstantResultHex(token1Result, 'token1()'), 'token1()')
  const reservesHex = getConstantResultHex(reservesResult, 'getReserves()')

  const normalizedNative = normalizeTronAddress(config.nativeTokenAddress)
  const normalizedStable = normalizeTronAddress(config.stableTokenAddress)
  const normalizedToken0 = normalizeTronAddress(token0)
  const normalizedToken1 = normalizeTronAddress(token1)

  let nativeReserveRaw: bigint
  let stableReserveRaw: bigint

  if (normalizedToken0 === normalizedNative && normalizedToken1 === normalizedStable) {
    nativeReserveRaw = decodeUintFromWord(reservesHex, 0, 'getReserves()')
    stableReserveRaw = decodeUintFromWord(reservesHex, 1, 'getReserves()')
  } else if (normalizedToken0 === normalizedStable && normalizedToken1 === normalizedNative) {
    nativeReserveRaw = decodeUintFromWord(reservesHex, 1, 'getReserves()')
    stableReserveRaw = decodeUintFromWord(reservesHex, 0, 'getReserves()')
  } else {
    throw new Error(
      `Configured TRON pool does not match configured native/stable tokens. token0=${token0}, token1=${token1}`,
    )
  }

  const rate = computePoolRate({
    nativeReserveRaw,
    nativeDecimals: config.nativeDecimals,
    stableReserveRaw,
    stableDecimals: config.stableDecimals,
  })

  return {
    chain: 'tron',
    poolAddress: config.poolAddress,
    nativeSymbol: config.nativeSymbol,
    stableSymbol: config.stableSymbol,
    fetchedAt: Date.now(),
    stablePerNative: rate.stablePerNative,
    nativePerStable: rate.nativePerStable,
  }
}
