import BigNumber from 'bignumber.js'
import { validateTransfer, ValidateTransferError } from '@solana/pay'
import { Connection, PublicKey, type LoadedAddresses } from '@solana/web3.js'
import { getSolanaBaseConfig } from '../env'
import { hasHashBeenUsed } from '../hash'
import type { VerifySolanaPayTransactionInput, VerifyTransactionResult } from '../types'
import { getSolanaOrderReference } from './solanaReference'

const resolveTimestampMs = (txBlockTimeSeconds?: number | null, referenceBlockTimeSeconds?: number | null): number => {
  const seconds = txBlockTimeSeconds ?? referenceBlockTimeSeconds
  if (!seconds || seconds <= 0) {
    return 0
  }

  return seconds * 1000
}

type SolanaTransaction = NonNullable<Awaited<ReturnType<Connection['getTransaction']>>>

const EMPTY_LOADED_ADDRESSES: LoadedAddresses = {
  writable: [],
  readonly: [],
}

const hasMatchingPublicKey = ({
  keys,
  reference,
}: {
  keys: PublicKey[]
  reference: PublicKey
}): boolean => {
  const referenceBase58 = reference.toBase58()
  return keys.some((key) => key.toBase58() === referenceBase58)
}

const hasReferenceAccountKey = ({
  reference,
  transaction,
}: {
  reference: PublicKey
  transaction: SolanaTransaction
}): boolean => {
  const message = transaction.transaction.message
  if (message.version === 'legacy') {
    return hasMatchingPublicKey({
      keys: message.accountKeys,
      reference,
    })
  }

  const accountKeys = message.getAccountKeys({
    accountKeysFromLookups: transaction.meta?.loadedAddresses ?? EMPTY_LOADED_ADDRESSES,
  })

  return accountKeys.keySegments().some((segment) =>
    hasMatchingPublicKey({
      keys: segment,
      reference,
    }),
  )
}

export const verifySolanaPayTransaction = async (
  input: VerifySolanaPayTransactionInput,
): Promise<VerifyTransactionResult> => {
  try {
    const config = getSolanaBaseConfig()
    const connection = new Connection(config.rpcUrl, { commitment: 'confirmed' })
    const recipient = new PublicKey(input.recipientAddress)
    const reference = getSolanaOrderReference(input.orderId)
    if (
      await hasHashBeenUsed({
        chain: 'solana',
        transactionHash: input.transactionHash,
        orderIdToExclude: input.orderId,
      })
    ) {
      return {
        chain: 'solana',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Transaction hash has already been used by another order.',
      }
    }

    await validateTransfer(connection, input.transactionHash, {
      recipient,
      amount: new BigNumber(String(input.expectedAmount)),
    })

    const tx = await connection.getTransaction(input.transactionHash, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })
    if (!tx) {
      return {
        chain: 'solana',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Transaction was not found.',
      }
    }

    if (!hasReferenceAccountKey({ reference, transaction: tx })) {
      return {
        chain: 'solana',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Transaction is missing the required order reference key.',
      }
    }

    const observedTimestampMs = resolveTimestampMs(tx.blockTime)
    if (!observedTimestampMs) {
      return {
        chain: 'solana',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Could not determine transaction timestamp.',
      }
    }

    if (observedTimestampMs < input.minTimestampMs) {
      return {
        chain: 'solana',
        ok: false,
        transactionHash: input.transactionHash,
        observedTimestampMs,
        error: 'Transaction is older than the required minimum timestamp.',
      }
    }

    return {
      chain: 'solana',
      ok: true,
      transactionHash: input.transactionHash,
      observedTimestampMs,
    }
  } catch (error) {
    if (error instanceof ValidateTransferError) {
      return {
        chain: 'solana',
        ok: false,
        error: error.message,
      }
    }

    return {
      chain: 'solana',
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown Solana verification error',
    }
  }
}
