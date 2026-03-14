import { getAddress } from '@ethersproject/address'

const hasMixedHexCase = (value: string): boolean => /[a-f]/.test(value) && /[A-F]/.test(value)

/**
 * Accepts checksummed and non-checksummed Ethereum addresses.
 * If a mixed-case address has an invalid checksum, we retry using lowercase.
 */
export const normalizeEthereumAddress = (address: string): string => {
  const trimmed = address.trim()

  try {
    return getAddress(trimmed)
  } catch (error) {
    if (!hasMixedHexCase(trimmed)) {
      throw error
    }

    return getAddress(trimmed.toLowerCase())
  }
}
