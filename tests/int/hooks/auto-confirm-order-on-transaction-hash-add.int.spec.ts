import { beforeEach, describe, expect, it, vi } from 'vitest'

const { confirmOrderMock } = vi.hoisted(() => ({
  confirmOrderMock: vi.fn(),
}))

vi.mock('@/payments/cryptoAdapter', () => ({
  cryptoAdapter: () => ({
    confirmOrder: confirmOrderMock,
  }),
}))

import { autoConfirmOrderOnTransactionHashAdd } from '@/hooks/autoConfirmOrderOnTransactionHashAdd'

const createHookArgs = () => {
  const logger = {
    error: vi.fn(),
  }

  return {
    context: {},
    doc: {
      id: 'order_1',
      status: 'processing',
      transactionHashes: [{ product: 'prod_1', chain: 'ethereum', transactionHash: '0xabc' }],
    },
    operation: 'update' as const,
    previousDoc: {
      id: 'order_1',
      status: 'processing',
      transactionHashes: [],
    },
    req: {
      payload: {
        logger,
      },
    },
    logger,
  }
}

describe('autoConfirmOrderOnTransactionHashAdd', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    confirmOrderMock.mockResolvedValue({
      message: 'Crypto order confirmed.',
      orderID: 'order_1',
      transactionID: 'tx_1',
    })
  })

  it('auto-confirms when a new transaction hash is appended on a processing order', async () => {
    const { context, doc, operation, previousDoc, req } = createHookArgs()

    const result = await autoConfirmOrderOnTransactionHashAdd({
      context,
      doc,
      operation,
      previousDoc,
      req: req as never,
    } as never)

    expect(result).toBe(doc)
    expect(confirmOrderMock).toHaveBeenCalledTimes(1)
    expect(confirmOrderMock).toHaveBeenCalledWith({
      cartsSlug: 'carts',
      data: { orderID: 'order_1' },
      ordersSlug: 'orders',
      req,
      transactionsSlug: 'transactions',
    })
  })

  it('does not call confirmation when no new hash was added', async () => {
    const { context, doc, operation, req } = createHookArgs()
    const previousDoc = {
      id: 'order_1',
      status: 'processing',
      transactionHashes: [{ product: 'prod_1', chain: 'ethereum', transactionHash: '0xabc' }],
    }

    await autoConfirmOrderOnTransactionHashAdd({
      context,
      doc,
      operation,
      previousDoc,
      req: req as never,
    } as never)

    expect(confirmOrderMock).not.toHaveBeenCalled()
  })

  it('swallows confirmation errors so transaction-hash updates do not crash', async () => {
    confirmOrderMock.mockRejectedValueOnce(new Error('verification failed'))

    const { context, doc, logger, operation, previousDoc, req } = createHookArgs()

    const result = await autoConfirmOrderOnTransactionHashAdd({
      context,
      doc,
      operation,
      previousDoc,
      req: req as never,
    } as never)

    expect(result).toBe(doc)
    expect(confirmOrderMock).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})
