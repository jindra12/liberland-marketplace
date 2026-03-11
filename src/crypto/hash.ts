import type { Where } from 'payload'
import type { SupportedChain } from './types'
import { getPayloadInstance } from './payload'

type HasHashBeenUsedInput = {
  chain: SupportedChain
  orderIdToExclude?: string
  transactionHash: string
}

const getHashCandidates = (transactionHash: string, chain: SupportedChain): string[] => {
  if (chain === 'solana') {
    return [transactionHash]
  }

  const lowered = transactionHash.toLowerCase()
  return lowered === transactionHash ? [transactionHash] : [transactionHash, lowered]
}

export const hasHashBeenUsed = async ({
  chain,
  orderIdToExclude,
  transactionHash,
}: HasHashBeenUsedInput): Promise<boolean> => {
  const candidates = getHashCandidates(transactionHash, chain)

  const payload = await getPayloadInstance()
  const hashWhere: Where =
    candidates.length === 1
      ? {
        'transactionHashes.transactionHash': {
          equals: candidates[0],
        },
      }
      : {
        or: candidates.map((candidate) => ({
          'transactionHashes.transactionHash': {
            equals: candidate,
          },
        })),
      }

  const where: Where = orderIdToExclude
    ? {
      and: [
        hashWhere,
        {
          id: {
            not_equals: orderIdToExclude,
          },
        },
      ],
    }
    : hashWhere

  const existing = await payload.find({
    collection: 'orders',
    depth: 0,
    limit: 1,
    pagination: false,
    where,
  })

  return existing.docs.length > 0
}
