import { toHex } from 'thirdweb/utils'

const normalizeHex = (value: string): string => {
  const lowered = value.toLowerCase()

  return lowered.startsWith('0x') ? lowered : `0x${lowered}`
}

export const getExpectedOrderReferenceHex = (orderId: string): string => {
  return normalizeHex(toHex(orderId))
}

export const hasMatchingOrderReferenceHex = ({
  actual,
  orderId,
}: {
  actual: string | null | undefined
  orderId: string
}): boolean => {
  if (!actual) {
    return false
  }

  return normalizeHex(actual) === getExpectedOrderReferenceHex(orderId)
}
