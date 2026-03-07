import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * We mock lower-level modules to isolate and verify the aggregation logic in
 * src/crypto/verification/index.ts.
 *
 * This suite checks that verification works per product assignment and grouped
 * by (chain + txHash + recipient wallet), including duplicate hash behavior.
 */
vi.mock('@/crypto/order', () => ({
  getOrderById: vi.fn(),
  getOrderCreatedAtMs: vi.fn(),
  getOrderCryptoPriceEntries: vi.fn(),
  getOrderTransactionHashEntries: vi.fn(),
}))

vi.mock('@/crypto/payload', () => ({
  getPayloadInstance: vi.fn(),
}))

vi.mock('@/crypto/recipient', () => ({
  resolveProductPaymentTargetsFromItems: vi.fn(),
}))

vi.mock('@/crypto/verification/ethereum', () => ({
  verifyEthereumNativeTransfer: vi.fn(),
}))

vi.mock('@/crypto/verification/solanaPay', () => ({
  verifySolanaPayTransaction: vi.fn(),
}))

vi.mock('@/crypto/verification/tron', () => ({
  verifyTronNativeTransfer: vi.fn(),
}))

vi.mock('@/crypto/env', () => ({
  getSolanaVerificationConfig: vi.fn(() => ({
    splTokenMintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  })),
}))

import {
  getOrderById,
  getOrderCreatedAtMs,
  getOrderCryptoPriceEntries,
  getOrderTransactionHashEntries,
} from '@/crypto/order'
import { getPayloadInstance } from '@/crypto/payload'
import { resolveProductPaymentTargetsFromItems } from '@/crypto/recipient'
import { verifyEthereumNativeTransfer } from '@/crypto/verification/ethereum'
import { verifySolanaPayTransaction } from '@/crypto/verification/solanaPay'
import { verifyTronNativeTransfer } from '@/crypto/verification/tron'
import { verifyTransactionOccurred } from '@/crypto/verification'

const ORDER_ID = 'order_1'

describe('crypto/verification aggregation integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(getPayloadInstance).mockResolvedValue({} as never)
    vi.mocked(getOrderById).mockResolvedValue({
      id: ORDER_ID,
      items: [{ product: 'p1', quantity: 1 }],
      createdAt: '2026-03-06T12:00:00.000Z',
    } as never)
    vi.mocked(getOrderCreatedAtMs).mockReturnValue(1_700_000_000_000)

    vi.mocked(getOrderCryptoPriceEntries).mockReturnValue([
      {
        chain: 'ethereum',
        fetchedAt: '2026-03-06T12:00:00.000Z',
        nativePerStable: 0.002,
        stablePerNative: 500,
      },
      {
        chain: 'solana',
        fetchedAt: '2026-03-06T12:00:00.000Z',
        nativePerStable: 0.01,
        stablePerNative: 100,
      },
      {
        chain: 'tron',
        fetchedAt: '2026-03-06T12:00:00.000Z',
        nativePerStable: 4,
        stablePerNative: 0.25,
      },
    ])

    vi.mocked(verifyEthereumNativeTransfer).mockImplementation(async (input) => ({
      chain: 'ethereum',
      ok: true,
      transactionHash: input.transactionHash,
      observedTimestampMs: 1_700_000_000_123,
    }))

    vi.mocked(verifySolanaPayTransaction).mockImplementation(async (input) => ({
      chain: 'solana',
      ok: true,
      transactionHash: input.transactionHash,
      observedTimestampMs: 1_700_000_000_123,
    }))

    vi.mocked(verifyTronNativeTransfer).mockImplementation(async (input) => ({
      chain: 'tron',
      ok: true,
      transactionHash: input.transactionHash,
      observedTimestampMs: 1_700_000_000_123,
    }))
  })

  it('groups same-order duplicate hashes by wallet and sums expected product amounts', async () => {
    vi.mocked(getOrderTransactionHashEntries).mockReturnValue([
      { chain: 'ethereum', productID: 'p1', transactionHash: '0xhash-shared' },
      { chain: 'ethereum', productID: 'p2', transactionHash: '0xhash-shared' },
      { chain: 'ethereum', productID: 'p3', transactionHash: '0xhash-second' },
    ])

    vi.mocked(resolveProductPaymentTargetsFromItems).mockResolvedValue([
      {
        chain: 'ethereum',
        normalizedRecipientAddress: '0xwallet-a',
        productID: 'p1',
        quantity: 1,
        recipientAddress: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
        stableAmount: 20,
        unitAmount: 20,
      },
      {
        chain: 'ethereum',
        normalizedRecipientAddress: '0xwallet-a',
        productID: 'p2',
        quantity: 1,
        recipientAddress: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
        stableAmount: 30,
        unitAmount: 30,
      },
      {
        chain: 'ethereum',
        normalizedRecipientAddress: '0xwallet-b',
        productID: 'p3',
        quantity: 1,
        recipientAddress: '0xBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBbBb',
        stableAmount: 40,
        unitAmount: 40,
      },
    ])

    const result = await verifyTransactionOccurred(ORDER_ID)

    expect(result.ok).toBe(true)

    // We expect exactly 2 on-chain verification calls:
    // 1) shared hash + wallet A => stable 20 + 30 = 50 => native 0.1 (rate 0.002)
    // 2) second hash + wallet B => stable 40 => native 0.08
    expect(vi.mocked(verifyEthereumNativeTransfer)).toHaveBeenCalledTimes(2)

    const firstCall = vi.mocked(verifyEthereumNativeTransfer).mock.calls[0][0]
    const secondCall = vi.mocked(verifyEthereumNativeTransfer).mock.calls[1][0]

    expect(firstCall.expectedAmount).toBeCloseTo(0.1, 12)
    expect(secondCall.expectedAmount).toBeCloseTo(0.08, 12)

    // Result carries grouped product IDs for traceability.
    const grouped = result.results.filter((entry) => entry.transactionHash === '0xhash-shared')
    expect(grouped[0]?.productIDs).toEqual(['p1', 'p2'])
  })

  it('fails when a product is mapped to more than one transaction entry', async () => {
    vi.mocked(getOrderTransactionHashEntries).mockReturnValue([
      { chain: 'ethereum', productID: 'p1', transactionHash: '0xhash-a' },
      { chain: 'ethereum', productID: 'p1', transactionHash: '0xhash-b' },
    ])

    vi.mocked(resolveProductPaymentTargetsFromItems).mockResolvedValue([
      {
        chain: 'ethereum',
        normalizedRecipientAddress: '0xwallet-a',
        productID: 'p1',
        quantity: 1,
        recipientAddress: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
        stableAmount: 20,
        unitAmount: 20,
      },
    ])

    const result = await verifyTransactionOccurred(ORDER_ID)

    expect(result.ok).toBe(false)
    expect(result.results.some((entry) => String(entry.error).includes('mapped to multiple transaction hash entries'))).toBe(true)

    // First entry still reaches verifier; second is rejected at assignment validation.
    expect(vi.mocked(verifyEthereumNativeTransfer)).toHaveBeenCalledTimes(1)
  })

  it('fails when order is missing transaction entry for one product target', async () => {
    vi.mocked(getOrderTransactionHashEntries).mockReturnValue([
      { chain: 'ethereum', productID: 'p1', transactionHash: '0xhash-a' },
    ])

    vi.mocked(resolveProductPaymentTargetsFromItems).mockResolvedValue([
      {
        chain: 'ethereum',
        normalizedRecipientAddress: '0xwallet-a',
        productID: 'p1',
        quantity: 1,
        recipientAddress: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
        stableAmount: 10,
        unitAmount: 10,
      },
      {
        chain: 'solana',
        normalizedRecipientAddress: 'sol-wallet',
        productID: 'p2',
        quantity: 1,
        recipientAddress: 'So11111111111111111111111111111111111111112',
        stableAmount: 5,
        unitAmount: 5,
      },
    ])

    const result = await verifyTransactionOccurred(ORDER_ID)

    expect(result.ok).toBe(false)
    expect(result.results.some((entry) => String(entry.error).includes('Missing transaction hash entry for product p2'))).toBe(true)
  })
})
