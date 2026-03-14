import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  MockValidateTransferError,
  mockGetSolanaBaseConfig,
  mockGetSolanaOrderReference,
  mockGetTransaction,
  mockHasHashBeenUsed,
  mockValidateTransfer,
} = vi.hoisted(() => {
  class MockValidateTransferError extends Error {}

  return {
    MockValidateTransferError,
    mockGetTransaction: vi.fn(),
    mockValidateTransfer: vi.fn(),
    mockHasHashBeenUsed: vi.fn(),
    mockGetSolanaBaseConfig: vi.fn(() => ({
      rpcUrl: 'https://rpc.solana.example',
      nativeSymbol: 'SOL' as const,
      stableSymbol: 'USDC' as const,
    })),
    mockGetSolanaOrderReference: vi.fn(() => ({
      toBase58: () => 'order-reference-key',
    })),
  }
})

vi.mock('@solana/web3.js', () => ({
  Connection: class Connection {
    constructor(_rpcUrl: string, _options: unknown) {}

    async getTransaction(...args: unknown[]) {
      return mockGetTransaction(...args)
    }
  },
  PublicKey: class PublicKey {
    private readonly value: string

    constructor(value: unknown) {
      this.value = String(value)
    }

    toBase58(): string {
      return this.value
    }
  },
}))

vi.mock('@solana/pay', () => ({
  validateTransfer: mockValidateTransfer,
  ValidateTransferError: MockValidateTransferError,
}))

vi.mock('@/crypto/hash', () => ({
  hasHashBeenUsed: mockHasHashBeenUsed,
}))

vi.mock('@/crypto/env', () => ({
  getSolanaBaseConfig: mockGetSolanaBaseConfig,
}))

vi.mock('@/crypto/verification/solanaReference', () => ({
  getSolanaOrderReference: mockGetSolanaOrderReference,
}))

import { validateTransfer } from '@solana/pay'
import { PublicKey } from '@solana/web3.js'
import { verifySolanaPayTransaction } from '@/crypto/verification/solanaPay'

const BASE_INPUT = {
  chain: 'solana' as const,
  expectedAmount: '1.23',
  minTimestampMs: 1_700_000_000_000,
  orderId: 'order-123',
  recipientAddress: 'recipient-sol-wallet',
  transactionHash: 'sol-tx-hash',
}

describe('crypto/verification/solanaPay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasHashBeenUsed.mockResolvedValue(false)
    mockValidateTransfer.mockResolvedValue({})
    mockGetTransaction.mockResolvedValue({
      blockTime: 1_700_000_100,
      meta: {},
      transaction: {
        message: {
          version: 'legacy',
          accountKeys: [new PublicKey('recipient-sol-wallet'), new PublicKey('order-reference-key')],
        },
      },
    })
  })

  it('does not pass reference into validateTransfer and still verifies order reference from tx keys', async () => {
    mockValidateTransfer.mockImplementation(async (_connection, _signature, fields: Record<string, unknown>) => {
      if (fields.reference) {
        throw new MockValidateTransferError('invalid instruction; programId is not SystemProgram')
      }
      return {}
    })

    const result = await verifySolanaPayTransaction(BASE_INPUT)

    expect(result.ok).toBe(true)
    const fields = vi.mocked(validateTransfer).mock.calls[0]?.[2] as unknown as {
      reference?: unknown
    }
    expect(fields).toBeDefined()
    expect(fields.reference).toBeUndefined()
  })

  it('fails when transaction does not include the order reference key', async () => {
    mockGetTransaction.mockResolvedValue({
      blockTime: 1_700_000_100,
      meta: {},
      transaction: {
        message: {
          version: 'legacy',
          accountKeys: [new PublicKey('recipient-sol-wallet')],
        },
      },
    })

    const result = await verifySolanaPayTransaction(BASE_INPUT)

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Transaction is missing the required order reference key.')
  })
})
