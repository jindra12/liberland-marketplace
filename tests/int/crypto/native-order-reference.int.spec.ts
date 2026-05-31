import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toHex } from 'thirdweb/utils'

const {
  mockGetEthereumBaseConfig,
  mockGetTronBaseConfig,
  mockHasHashBeenUsed,
  mockWithEthereumProvider,
  mockCreateTronClient,
  mockDecimalToUnits,
} = vi.hoisted(() => ({
  mockCreateTronClient: vi.fn(),
  mockDecimalToUnits: vi.fn(),
  mockGetEthereumBaseConfig: vi.fn(() => ({ nativeDecimals: 18 })),
  mockGetTronBaseConfig: vi.fn(() => ({ apiUrl: 'https://tron.example' })),
  mockHasHashBeenUsed: vi.fn(),
  mockWithEthereumProvider: vi.fn(),
}))

const TRON_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'

vi.mock('@/crypto/env', () => ({
  getEthereumBaseConfig: mockGetEthereumBaseConfig,
  getTronBaseConfig: mockGetTronBaseConfig,
}))

vi.mock('@/crypto/hash', () => ({
  hasHashBeenUsed: mockHasHashBeenUsed,
}))

vi.mock('@/crypto/ethereumProvider', () => ({
  withEthereumProvider: mockWithEthereumProvider,
}))

vi.mock('@/crypto/tron', () => ({
  createTronClient: mockCreateTronClient,
  normalizeTronAddress: (address: string) => address.toLowerCase(),
}))

vi.mock('tronweb', () => ({
  TronWeb: class TronWeb {
    static isAddress() {
      return true
    }
  },
}))

vi.mock('@/crypto/math', () => ({
  decimalToUnits: mockDecimalToUnits,
}))

import { verifyEthereumNativeTransfer } from '@/crypto/verification/ethereum'
import { verifyTronNativeTransfer } from '@/crypto/verification/tron'

describe('crypto verification order reference payload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasHashBeenUsed.mockResolvedValue(false)
    mockDecimalToUnits.mockReturnValue(1n)
  })

  it('rejects ethereum transfers that do not include the order id payload', async () => {
    mockWithEthereumProvider.mockImplementation(
      async (fn: (provider: unknown) => Promise<unknown>) =>
        fn({
          getBlock: vi.fn(async () => ({ timestamp: 1_700_000_000 })),
          getTransaction: vi.fn(async () => ({
            input: toHex('different-order'),
            to: '0x1111111111111111111111111111111111111111',
            value: { toString: () => '1' },
          })),
          getTransactionReceipt: vi.fn(async () => ({ blockNumber: 1, status: 1 })),
        }),
    )

    const result = await verifyEthereumNativeTransfer({
      chain: 'ethereum',
      expectedAmount: '1',
      minTimestampMs: 1_600_000_000_000,
      orderId: 'order-123',
      recipientAddress: '0x1111111111111111111111111111111111111111',
      transactionHash: '0xeth-hash',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Transaction is missing the required order ID payload.')
  })

  it('rejects tron transfers that do not include the order id payload', async () => {
    mockCreateTronClient.mockResolvedValue({
      trx: {
        getTransaction: vi.fn(async () => ({
          raw_data: {
            contract: [
              {
                type: 'TransferContract',
                parameter: {
                  value: {
                    amount: '1',
                    data: toHex('different-order').slice(2),
                    to_address: TRON_ADDRESS,
                  },
                },
              },
            ],
            data: toHex('different-order').slice(2),
            timestamp: 1_700_000_000_000,
          },
          ret: [{ contractRet: 'SUCCESS' }],
        })),
        getTransactionInfo: vi.fn(async () => ({
          blockTimeStamp: 1_700_000_000_000,
          receipt: { result: 'SUCCESS' },
        })),
      },
    })

    const result = await verifyTronNativeTransfer({
      chain: 'tron',
      expectedAmount: '1',
      minTimestampMs: 1_600_000_000_000,
      orderId: 'order-123',
      recipientAddress: TRON_ADDRESS,
      transactionHash: 'tron-hash',
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBe('Transaction is missing the required order ID payload.')
  })
})
