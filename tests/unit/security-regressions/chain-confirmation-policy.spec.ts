import { describe, expect, it, vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import type { JsonRpcProvider, TransactionResponse } from '@ethersproject/providers'
import type { TronWeb } from 'tronweb'
import { withEthereumProvider } from '@/crypto/ethereumProvider'
import { getEthereumBaseConfig, getTronBaseConfig } from '@/crypto/env'
import { createTronClient } from '@/crypto/tron'
import { getExpectedOrderReferenceHex } from '@/crypto/verification/orderReference'
import { verifyEthereumNativeTransfer } from '@/crypto/verification/ethereum'
import { verifyTronNativeTransfer } from '@/crypto/verification/tron'

vi.mock('@/crypto/hash', () => ({ hasHashBeenUsed: async () => false }))
vi.mock('@/crypto/env', () => ({ getEthereumBaseConfig: vi.fn(), getTronBaseConfig: vi.fn() }))
vi.mock('@/crypto/ethereumProvider', () => ({ withEthereumProvider: vi.fn() }))
vi.mock('@/crypto/tron', async (original) => ({
  ...(await original<typeof import('@/crypto/tron')>()),
  createTronClient: vi.fn(),
}))

describe('Payment chain confirmation policy', () => {
  it.each([
    { finalizedBlock: 99, canonical: true, accepted: false },
    { finalizedBlock: 100, canonical: true, accepted: true },
    { finalizedBlock: 101, canonical: false, accepted: false },
  ])(
    'requires finalized canonical Ethereum inclusion (finalized block $finalizedBlock, canonical $canonical)',
    async (fixture) => {
      const provider = mockDeep<JsonRpcProvider>()
      const recipient = `0x${'11'.repeat(20)}`
      vi.mocked(getEthereumBaseConfig).mockReturnValue({
        nativeDecimals: 18,
        nativeSymbol: 'ETH',
        stableDecimals: 6,
        stableSymbol: 'USDC',
        rpcUrl: 'https://rpc.example',
      })
      vi.mocked(withEthereumProvider).mockImplementation(async (task) =>
        task(provider, 'https://rpc.example'),
      )
      provider.getTransaction.mockResolvedValue(
        Object.assign(
          mock<TransactionResponse>({
            to: recipient,
            value: mock<TransactionResponse['value']>({ toString: () => '1000000000000000000' }),
            data: getExpectedOrderReferenceHex('order'),
          }),
          { input: getExpectedOrderReferenceHex('order') },
        ),
      )
      provider.getTransactionReceipt.mockResolvedValue(
        mock<Awaited<ReturnType<JsonRpcProvider['getTransactionReceipt']>>>({
          status: 1,
          blockNumber: 100,
          confirmations: 1,
          blockHash: `0x${'bb'.repeat(32)}`,
        }),
      )
      provider.getBlock.mockImplementation(async (block) =>
        mock<Awaited<ReturnType<JsonRpcProvider['getBlock']>>>({
          number: block === 'finalized' ? fixture.finalizedBlock : 100,
          timestamp: Math.floor(Date.now() / 1000),
          hash: `0x${(fixture.canonical ? 'bb' : 'cc').repeat(32)}`,
        }),
      )
      const result = await verifyEthereumNativeTransfer({
        chain: 'ethereum',
        orderId: 'order',
        transactionHash: `0x${'aa'.repeat(32)}`,
        recipientAddress: recipient,
        expectedAmount: '1',
        minTimestampMs: 0,
      })
      expect(result.ok).toBe(fixture.accepted)
      if (!fixture.accepted) {
        expect(result.error).toMatch(/final|confirm|pending/i)
      }
    },
  )

  it.each([
    { label: 'no included block', blockTimeStamp: 0, blockNumber: 0, accepted: false },
    {
      label: 'an old included block with a fresh sender-controlled timestamp',
      blockTimeStamp: 1000,
      blockNumber: 1,
      accepted: false,
    },
    {
      label: 'a recent solidified block',
      blockTimeStamp: Date.now(),
      blockNumber: 10,
      accepted: true,
    },
  ])('checks solidified TRON inclusion with $label', async (fixture) => {
    const tron = mockDeep<TronWeb>()
    const recipient = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
    const now = Date.now()
    vi.mocked(getTronBaseConfig).mockReturnValue({
      apiUrl: 'https://rpc.example',
      nativeDecimals: 6,
      nativeSymbol: 'TRX',
      stableDecimals: 6,
      stableSymbol: 'USDT',
    })
    vi.mocked(createTronClient).mockResolvedValue(tron)
    tron.trx.getConfirmedTransaction.mockResolvedValue(
      Object.assign(mock<Awaited<ReturnType<TronWeb['trx']['getTransaction']>>>(), {
        ret: [{ contractRet: 'SUCCESS' }],
        raw_data: {
          timestamp: now,
          data: getExpectedOrderReferenceHex('order'),
          contract: [
            {
              type: 'TransferContract',
              parameter: { value: { to_address: recipient, amount: 1000000 } },
            },
          ],
        },
      }),
    )
    tron.trx.getTransactionInfo.mockResolvedValue(
      Object.assign(mock<Awaited<ReturnType<TronWeb['trx']['getTransactionInfo']>>>(), fixture),
    )
    const result = await verifyTronNativeTransfer({
      chain: 'tron',
      orderId: 'order',
      transactionHash: 'aa'.repeat(32),
      recipientAddress: recipient,
      expectedAmount: '1',
      minTimestampMs: now - 60000,
    })
    expect(result.ok).toBe(fixture.accepted)
    expect(tron.trx.getConfirmedTransaction).toHaveBeenCalledWith('aa'.repeat(32))
  })
})
