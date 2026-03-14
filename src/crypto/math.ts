const DECIMAL_RE = /^\d+(\.\d+)?$/

export const decimalToUnits = (value: number | string, decimals: number): bigint => {
  const raw = String(value).trim()

  if (!DECIMAL_RE.test(raw)) {
    throw new Error(`Invalid decimal amount: "${raw}"`)
  }

  const [wholePart, fractionalPart = ''] = raw.split('.')
  if (fractionalPart.length > decimals) {
    throw new Error(
      `Too many decimal places for amount "${raw}". Max allowed for this chain is ${decimals}.`,
    )
  }

  const paddedFraction = (fractionalPart + '0'.repeat(decimals)).slice(0, decimals)
  const wholeUnits = BigInt(wholePart) * 10n ** BigInt(decimals)
  const fractionUnits = paddedFraction.length > 0 ? BigInt(paddedFraction) : 0n

  return wholeUnits + fractionUnits
}

export const unitsToNumber = (value: bigint, decimals: number): number => {
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = value % base

  if (fraction === 0n) {
    return Number(whole)
  }

  const fractionString = fraction.toString().padStart(decimals, '0').replace(/0+$/, '')
  const normalized = fractionString.length > 0 ? `${whole.toString()}.${fractionString}` : whole.toString()

  return Number(normalized)
}

export const computePoolRate = ({
  nativeDecimals,
  nativeReserveRaw,
  stableDecimals,
  stableReserveRaw,
}: {
  nativeDecimals: number
  nativeReserveRaw: bigint
  stableDecimals: number
  stableReserveRaw: bigint
}): {
  nativePerStable: number
  stablePerNative: number
} => {
  if (nativeReserveRaw <= 0n || stableReserveRaw <= 0n) {
    throw new Error('Pool reserves are empty or invalid.')
  }

  const nativeReserve = unitsToNumber(nativeReserveRaw, nativeDecimals)
  const stableReserve = unitsToNumber(stableReserveRaw, stableDecimals)

  if (!Number.isFinite(nativeReserve) || !Number.isFinite(stableReserve) || nativeReserve <= 0 || stableReserve <= 0) {
    throw new Error('Failed to compute reserve ratios.')
  }

  return {
    stablePerNative: stableReserve / nativeReserve,
    nativePerStable: nativeReserve / stableReserve,
  }
}
