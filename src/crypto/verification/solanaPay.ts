import BigNumber from 'bignumber.js'
import { validateTransfer, ValidateTransferError } from '@solana/pay'
import { Connection, PublicKey } from '@solana/web3.js'
import { getSolanaBaseConfig } from '../env'
import { hasHashBeenUsed, normalizeTransactionHash } from '../hash'
import type { VerifySolanaPayTransactionInput, VerifyTransactionResult } from '../types'

const resolveTimestampMs = (txBlockTimeSeconds?: number | null, referenceBlockTimeSeconds?: number | null): number => {
  const seconds = txBlockTimeSeconds ?? referenceBlockTimeSeconds
  if (!seconds || seconds <= 0) {
    return 0
  }

  return seconds * 1000
}

export const verifySolanaPayTransaction = async (
  input: VerifySolanaPayTransactionInput,
): Promise<VerifyTransactionResult> => {
  try {
    const config = getSolanaBaseConfig()
    const connection = new Connection(config.rpcUrl, { commitment: 'confirmed' })
    const recipient = new PublicKey(input.recipientAddress)
    const splTokenMint = new PublicKey(input.splTokenMintAddress)
    const transactionHash = normalizeTransactionHash(input.transactionHash, 'solana')
    if (
      await hasHashBeenUsed({
        chain: 'solana',
        transactionHash,
        orderIdToExclude: input.orderIdToExclude,
      })
    ) {
      return {
        chain: 'solana',
        ok: false,
        transactionHash,
        error: 'Transaction hash has already been used by another order.',
      }
    }

    await validateTransfer(connection, transactionHash, {
      recipient,
      amount: new BigNumber(String(input.expectedAmount)),
      splToken: splTokenMint,
    })

    const tx = await connection.getTransaction(transactionHash, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })

    const observedTimestampMs = resolveTimestampMs(tx?.blockTime)
    if (!observedTimestampMs) {
      return {
        chain: 'solana',
        ok: false,
        transactionHash,
        error: 'Could not determine transaction timestamp.',
      }
    }

    if (observedTimestampMs < input.minTimestampMs) {
      return {
        chain: 'solana',
        ok: false,
        transactionHash,
        observedTimestampMs,
        error: 'Transaction is older than the required minimum timestamp.',
      }
    }

    return {
      chain: 'solana',
      ok: true,
      transactionHash,
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
