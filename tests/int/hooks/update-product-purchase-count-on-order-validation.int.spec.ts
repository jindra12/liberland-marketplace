import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resolveProductIDsForItemsMock } = vi.hoisted(() => ({
  resolveProductIDsForItemsMock: vi.fn(),
}))

vi.mock('@/crypto/recipient', () => ({
  resolveProductIDsForItems: resolveProductIDsForItemsMock,
}))

import { updateProductPurchaseCountAfterOrderValidation } from '@/hooks/updateProductPurchaseCount'

const createHookArgs = ({ status }: { status: string }) => {
  const payload = {
    findByID: vi.fn(async ({ id }: { collection: string; id: string }) => {
      return {
        id,
        purchaseCount: id === 'prod_1' ? 2 : 0,
      }
    }),
    update: vi.fn(async ({ data, id }: { collection: string; data: Record<string, unknown>; id: string }) => ({
      id,
      ...data,
    })),
  }

  return {
    doc: {
      id: 'order_1',
      items: [{ product: 'prod_1' }, { product: 'prod_1' }, { product: 'prod_2' }],
      status,
    },
    operation: 'update' as const,
    payload,
    previousDoc: {
      id: 'order_1',
      items: [{ product: 'prod_1' }],
      status: 'processing',
    },
    req: {
      payload,
    },
  }
}

describe('updateProductPurchaseCountAfterOrderValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('increments each unique product once when an order completes', async () => {
    vi.mocked(resolveProductIDsForItemsMock).mockResolvedValue(['prod_1', 'prod_1', 'prod_2'])

    const { doc, operation, previousDoc, req } = createHookArgs({
      status: 'completed',
    })

    const result = await updateProductPurchaseCountAfterOrderValidation({
      doc: doc as never,
      operation,
      previousDoc: previousDoc as never,
      req: req as never,
    } as never)

    expect(result).toBe(doc)
    expect(req.payload.findByID).toHaveBeenCalledTimes(2)
    expect(req.payload.update).toHaveBeenCalledTimes(2)
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'products',
        data: {
          purchaseCount: 3,
        },
        id: 'prod_1',
      }),
    )
    expect(req.payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'products',
        data: {
          purchaseCount: 1,
        },
        id: 'prod_2',
      }),
    )
  })

  it('does not increment counts when the order is not completed', async () => {
    vi.mocked(resolveProductIDsForItemsMock).mockResolvedValue(['prod_1'])

    const { doc, operation, previousDoc, req } = createHookArgs({
      status: 'processing',
    })

    await updateProductPurchaseCountAfterOrderValidation({
      doc: doc as never,
      operation,
      previousDoc: previousDoc as never,
      req: req as never,
    } as never)

    expect(req.payload.findByID).not.toHaveBeenCalled()
    expect(req.payload.update).not.toHaveBeenCalled()
  })
})
