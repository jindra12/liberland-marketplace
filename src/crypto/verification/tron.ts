import { TronWeb } from 'tronweb'
import { getTronBaseConfig } from '../env'
import { hasHashBeenUsed } from '../hash'
import { decimalToUnits } from '../math'
import { createTronClient, normalizeTronAddress } from '../tron'
import type { VerifyNativeTransferTransactionInput, VerifyTransactionResult } from '../types'

type TronTransferPayload = {
  amount?: string | number
  to_address?: string
}

type TronTransaction = Awaited<ReturnType<TronWeb['trx']['getTransaction']>>
type TronTransactionInfo = Awaited<ReturnType<TronWeb['trx']['getTransactionInfo']>>

const isTronTxSuccessful = (tx: TronTransaction, txInfo?: TronTransactionInfo): boolean => {
  const txStatus = tx?.ret?.[0]?.contractRet
  if (txStatus === 'SUCCESS') {
    return true
  }

  const txInfoStatus = txInfo?.receipt?.result
  return txInfoStatus === 'SUCCESS'
}

export const verifyTronNativeTransfer = async (
  input: VerifyNativeTransferTransactionInput,
): Promise<VerifyTransactionResult> => {
  try {
    if (
      await hasHashBeenUsed({
        chain: 'tron',
        transactionHash: input.transactionHash,
        orderIdToExclude: input.orderIdToExclude,
      })
    ) {
      return {
        chain: 'tron',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Transaction hash has already been used by another order.',
      }
    }

    if (!TronWeb.isAddress(input.recipientAddress)) {
      return {
        chain: 'tron',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Recipient address is not a valid TRON address.',
      }
    }

    const config = getTronBaseConfig()
    const tronWeb = createTronClient(config)
    const [tx, txInfo] = await Promise.all([
      tronWeb.trx.getTransaction(input.transactionHash),
      tronWeb.trx.getTransactionInfo(input.transactionHash).catch(() => undefined),
    ])

    const contractType = tx?.raw_data?.contract?.[0]?.type
    if (contractType !== 'TransferContract') {
      return {
        chain: 'tron',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Transaction is not a direct TRX transfer.',
      }
    }

    if (!isTronTxSuccessful(tx, txInfo)) {
      return {
        chain: 'tron',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Transaction failed on-chain.',
      }
    }

    const transfer = tx.raw_data.contract[0].parameter?.value as TronTransferPayload | undefined
    if (!transfer?.to_address || transfer.amount === undefined || transfer.amount === null) {
      return {
        chain: 'tron',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Transfer details are missing from transaction payload.',
      }
    }

    const expectedRecipient = normalizeTronAddress(input.recipientAddress)
    const actualRecipient = normalizeTronAddress(transfer.to_address)
    if (expectedRecipient !== actualRecipient) {
      return {
        chain: 'tron',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Transaction recipient does not match.',
      }
    }

    const expectedAmountSun = decimalToUnits(input.expectedAmount, config.nativeDecimals)
    const actualAmountSun = BigInt(String(transfer.amount))
    if (actualAmountSun !== expectedAmountSun) {
      return {
        chain: 'tron',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Transaction amount does not match.',
      }
    }

    const observedTimestampMs = Number(tx?.raw_data?.timestamp ?? txInfo?.blockTimeStamp ?? 0)
    if (!observedTimestampMs) {
      return {
        chain: 'tron',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Could not determine transaction timestamp.',
      }
    }

    if (observedTimestampMs < input.minTimestampMs) {
      return {
        chain: 'tron',
        ok: false,
        transactionHash: input.transactionHash,
        observedTimestampMs,
        error: 'Transaction is older than the required minimum timestamp.',
      }
    }

    return {
      chain: 'tron',
      ok: true,
      transactionHash: input.transactionHash,
      observedTimestampMs,
    }
  } catch (error) {
    return {
      chain: 'tron',
      ok: false,
      transactionHash: input.transactionHash,
      error: error instanceof Error ? error.message : 'Unknown TRON verification error',
    }
  }
}
