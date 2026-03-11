import { normalizeEthereumAddress } from '../ethereum'
import { withEthereumProvider } from '../ethereumProvider'
import { getEthereumBaseConfig } from '../env'
import { hasHashBeenUsed } from '../hash'
import { decimalToUnits } from '../math'
import type { VerifyNativeTransferTransactionInput, VerifyTransactionResult } from '../types'

export const verifyEthereumNativeTransfer = async (
  input: VerifyNativeTransferTransactionInput,
): Promise<VerifyTransactionResult> => {
  try {
    if (
      await hasHashBeenUsed({
        chain: 'ethereum',
        transactionHash: input.transactionHash,
        orderIdToExclude: input.orderIdToExclude,
      })
    ) {
      return {
        chain: 'ethereum',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Transaction hash has already been used by another order.',
      }
    }

    const config = getEthereumBaseConfig()
    const [tx, receipt] = await withEthereumProvider((provider) =>
      Promise.all([provider.getTransaction(input.transactionHash), provider.getTransactionReceipt(input.transactionHash)]),
    )

    if (!tx || !receipt) {
      return {
        chain: 'ethereum',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Transaction was not found.',
      }
    }

    if (receipt.status !== 1) {
      return {
        chain: 'ethereum',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Transaction failed on-chain.',
      }
    }

    if (!tx.to) {
      return {
        chain: 'ethereum',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Transaction does not have a direct recipient (contract creation or internal flow).',
      }
    }

    const expectedRecipient = normalizeEthereumAddress(input.recipientAddress)
    const actualRecipient = normalizeEthereumAddress(tx.to)
    if (expectedRecipient !== actualRecipient) {
      return {
        chain: 'ethereum',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Transaction recipient does not match.',
      }
    }

    const expectedAmountWei = decimalToUnits(input.expectedAmount, config.nativeDecimals)
    const actualAmountWei = BigInt(tx.value.toString())
    if (actualAmountWei !== expectedAmountWei) {
      return {
        chain: 'ethereum',
        ok: false,
        transactionHash: input.transactionHash,
        error: 'Transaction amount does not match.',
      }
    }

    const block = await withEthereumProvider((provider) => provider.getBlock(receipt.blockNumber))
    const observedTimestampMs = block.timestamp * 1000

    if (observedTimestampMs < input.minTimestampMs) {
      return {
        chain: 'ethereum',
        ok: false,
        transactionHash: input.transactionHash,
        observedTimestampMs,
        error: 'Transaction is older than the required minimum timestamp.',
      }
    }

    return {
      chain: 'ethereum',
      ok: true,
      transactionHash: input.transactionHash,
      observedTimestampMs,
    }
  } catch (error) {
    return {
      chain: 'ethereum',
      ok: false,
      transactionHash: input.transactionHash,
      error: error instanceof Error ? error.message : 'Unknown Ethereum verification error',
    }
  }
}
