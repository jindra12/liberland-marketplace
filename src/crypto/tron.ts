import { TronWeb } from 'tronweb'

type TronConfig = {
  eventServerUrl?: string
  fullNodeUrl: string
  proApiKey?: string
  solidityNodeUrl?: string
}

const TRON_HEX_ADDRESS_RE = /^41[0-9a-fA-F]{40}$/
const EVM_HEX_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BASE58_RADIX = 58n

const BASE58_INDEX: Record<string, number> = BASE58_ALPHABET.split('').reduce<Record<string, number>>(
  (acc, char, index) => {
    acc[char] = index
    return acc
  },
  {},
)

const hexByte = (value: number): string => value.toString(16).padStart(2, '0')

const decodeBase58 = (value: string): Uint8Array => {
  let numericValue = 0n

  for (const char of value) {
    const index = BASE58_INDEX[char]
    if (index === undefined) {
      throw new Error(`Invalid TRON address character "${char}".`)
    }

    numericValue = numericValue * BASE58_RADIX + BigInt(index)
  }

  let hex = numericValue.toString(16)
  if (hex.length % 2 !== 0) {
    hex = `0${hex}`
  }

  const bytes: number[] = []
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(Number.parseInt(hex.slice(i, i + 2), 16))
  }

  let leadingZeroCount = 0
  while (leadingZeroCount < value.length && value[leadingZeroCount] === '1') {
    leadingZeroCount += 1
  }

  if (leadingZeroCount === 0) {
    return Uint8Array.from(bytes)
  }

  return Uint8Array.from([...new Array(leadingZeroCount).fill(0), ...bytes])
}

const normalizeTronBase58Address = (address: string): string => {
  const decoded = decodeBase58(address)
  if (decoded.length < 21) {
    throw new Error('Invalid TRON address length.')
  }

  // Base58-check payload is 21 bytes (0x41 + 20-byte address), followed by 4-byte checksum.
  const payload = decoded.slice(0, 21)
  if (payload[0] !== 0x41) {
    throw new Error('Invalid TRON address prefix.')
  }

  return Array.from(payload, hexByte).join('').toLowerCase()
}

export const createTronClient = (config: TronConfig): TronWeb => {
  const headers = config.proApiKey ? { 'TRON-PRO-API-KEY': config.proApiKey } : undefined

  return new TronWeb({
    fullHost: config.fullNodeUrl,
    fullNode: config.fullNodeUrl,
    solidityNode: config.solidityNodeUrl || config.fullNodeUrl,
    eventServer: config.eventServerUrl,
    headers,
  })
}

export const normalizeTronAddress = (address: string): string => {
  const trimmed = address.trim()

  if (TRON_HEX_ADDRESS_RE.test(trimmed)) {
    return trimmed.toLowerCase()
  }

  if (EVM_HEX_ADDRESS_RE.test(trimmed)) {
    return `41${trimmed.slice(2)}`.toLowerCase()
  }

  return normalizeTronBase58Address(trimmed)
}
