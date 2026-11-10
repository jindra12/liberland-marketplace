import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mock, mockDeep, mockReset } from 'vitest-mock-extended'
import {
  APIError,
  type PaginatedDocs,
  type PayloadRequest,
  type SanitizedCollectionConfig,
  type TypeWithVersion,
  type UpdateOneArgs,
} from 'payload'
import type { Order, Product } from '@/payload-types'
import { updateAtomically } from '@/utilities/atomicUpdates/utils'

const req = mockDeep<PayloadRequest>()
// Payload's adapter returns null on a failed conditional write, but its published type omits null.
const write = vi.fn<(args: UpdateOneArgs) => Promise<Product | Order | null>>()
const read = vi.fn<() => Promise<Product | Order | null>>()
const original = mock<Product>({
  id: 'product',
  name: 'Published product',
  inventory: 10,
  updatedAt: '2026-01-01T00:00:00.000Z',
  operationalUpdatedAt: '2026-01-01T00:00:00.000Z',
})
const committed = { ...original, inventory: 8, updatedAt: '2026-01-01T00:00:00.001Z' }

beforeEach(() => {
  mockReset(req)
  write.mockReset()
  read.mockReset()
  Object.assign(req.payload.db, { updateOne: write, findOne: read })
  req.payload.collections.products.config = mockDeep<SanitizedCollectionConfig>({
    slug: 'products',
    versions: {
      drafts: { autosave: false, schedulePublish: false, validate: false },
      maxPerDoc: 0,
    },
  })
  req.payload.collections.orders.config = mockDeep<SanitizedCollectionConfig>({
    slug: 'orders',
    versions: { drafts: false, maxPerDoc: 0 },
  })
  req.payload.db.findVersions.mockResolvedValue(
    mock<PaginatedDocs<TypeWithVersion<Product>>>({ docs: [] }),
  )
  read.mockResolvedValue(original)
  write.mockResolvedValue(committed)
})

describe('Atomic operational updates', () => {
  it('returns the adapter write snapshot without substituting a later concurrent edit', async () => {
    read.mockResolvedValueOnce(original).mockResolvedValue({ ...committed, inventory: 3 })
    const result = await updateAtomically({
      collection: 'products',
      id: original.id,
      req,
      update: () => ({ inventory: 8 }),
    })
    expect(result).toEqual(committed)
    expect(read).toHaveBeenCalledTimes(1)
    expect(req.payloadDataLoader).toBeDefined()
  })

  it('recomputes a conflicting update using the newly read inventory and revision', async () => {
    const concurrent = { ...original, inventory: 7, operationalUpdatedAt: committed.updatedAt }
    read.mockResolvedValueOnce(original).mockResolvedValue(concurrent)
    write.mockResolvedValueOnce(null).mockResolvedValue({ ...concurrent, inventory: 5 })
    const update = vi.fn((product: Product) => ({ inventory: product.inventory! - 2 }))
    expect(
      await updateAtomically({ collection: 'products', id: original.id, req, update }),
    ).toMatchObject({ inventory: 5 })
    expect(update.mock.calls.map(([product]) => product.inventory)).toEqual([10, 7])
    expect(write.mock.calls.map(([args]) => args.data.inventory)).toEqual([8, 5])
    expect(write.mock.calls[1][0].where).toMatchObject({
      and: expect.arrayContaining([
        { operationalUpdatedAt: { equals: concurrent.operationalUpdatedAt } },
        { inventory: { equals: 7 } },
      ]),
    })
  })

  it('does not retry business errors even when they use the conflict HTTP status', async () => {
    const update = vi.fn(() => {
      throw new APIError('Insufficient inventory', 409)
    })
    await expect(
      updateAtomically({ collection: 'products', id: original.id, req, update }),
    ).rejects.toThrow('Insufficient inventory')
    expect(update).toHaveBeenCalledTimes(1)
    expect(write).not.toHaveBeenCalled()
  })

  it('bounds retries when every conditional write conflicts', async () => {
    write.mockResolvedValue(null)
    await expect(
      updateAtomically({
        collection: 'products',
        id: original.id,
        req,
        update: () => ({ inventory: 8 }),
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(write).toHaveBeenCalledTimes(9)
  })

  it('does not write when a record has disappeared', async () => {
    read.mockResolvedValue(null)
    await expect(
      updateAtomically({
        collection: 'products',
        id: original.id,
        req,
        update: () => ({ inventory: 8 }),
      }),
    ).rejects.toMatchObject({ status: 404 })
    expect(write).not.toHaveBeenCalled()
  })

  it('keeps revisions increasing when the record timestamp is ahead of the clock', async () => {
    const timestamp = '2099-01-01T00:00:00.000Z'
    read.mockResolvedValue({
      ...original,
      updatedAt: timestamp,
      operationalUpdatedAt: timestamp,
    })
    await updateAtomically({
      collection: 'products',
      id: original.id,
      req,
      update: () => ({ inventory: 8 }),
    })
    expect(write.mock.calls[0][0].data).toMatchObject({
      updatedAt: '2099-01-01T00:00:00.001Z',
      operationalUpdatedAt: '2099-01-01T00:00:00.001Z',
    })
  })

  it.each([undefined, null])(
    'protects legacy records with a %s revision and zero inventory',
    async (revision) => {
      read.mockResolvedValue({
        ...original,
        inventory: 0,
        operationalUpdatedAt: revision,
      })
      await updateAtomically({
        collection: 'products',
        id: original.id,
        req,
        update: () => ({ inventory: 2 }),
      })
      expect(write.mock.calls[0][0].where).toEqual({
        and: [
          { id: { equals: original.id } },
          {
            or: [
              { operationalUpdatedAt: { exists: false } },
              { operationalUpdatedAt: { equals: null } },
            ],
          },
          { inventory: { equals: 0 } },
        ],
      })
    },
  )

  it('guards seller proof writes against a concurrent change to order status', async () => {
    const order = mock<Order>({
      id: 'order',
      status: 'completed',
      paymentProofs: [],
      updatedAt: original.updatedAt,
      operationalUpdatedAt: null,
    })
    read.mockResolvedValue(order)
    write.mockResolvedValue(order)
    await updateAtomically({
      collection: 'orders',
      id: order.id,
      req,
      update: () => ({ paymentProofs: [] }),
    })
    expect(write.mock.calls[0][0].where).toMatchObject({
      and: expect.arrayContaining([{ status: { equals: 'completed' } }]),
    })
  })

  it('merges operational changes into the draft without overwriting unpublished editorial fields', async () => {
    req.payload.collections.products.config.versions!.maxPerDoc = 2
    const draft: Product = { ...original, name: 'Unpublished edit', _status: 'draft' }
    req.payload.db.findVersions.mockResolvedValue(
      mock<PaginatedDocs<TypeWithVersion<Product>>>({
        docs: [
          mock<TypeWithVersion<Product>>({
            id: 'draft',
            version: draft,
            updatedAt: original.updatedAt,
          }),
        ],
      }),
    )
    read.mockResolvedValueOnce(original).mockResolvedValue(committed)
    await updateAtomically({
      collection: 'products',
      id: original.id,
      req,
      update: () => ({ inventory: 8 }),
    })
    expect(req.payload.db.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        parent: original.id,
        createdAt: committed.updatedAt,
        updatedAt: committed.updatedAt,
        versionData: expect.objectContaining({
          name: 'Unpublished edit',
          _status: 'draft',
          inventory: 8,
        }),
      }),
    )
    expect(req.payload.db.findVersions).toHaveBeenCalledWith(expect.objectContaining({ page: 3 }))
  })

  it('repairs a failed version write on an idempotent retry without repeating the inventory change', async () => {
    req.payload.db.createVersion.mockRejectedValueOnce(new Error('Version store unavailable'))
    read.mockResolvedValueOnce(original).mockResolvedValue(committed)
    const update = vi.fn((product: Product) => (product.inventory === 8 ? null : { inventory: 8 }))
    const args = { collection: 'products' as const, id: original.id, req, update }
    await expect(updateAtomically(args)).rejects.toThrow('Version store unavailable')
    expect(await updateAtomically(args)).toMatchObject({ inventory: 8 })
    expect(write).toHaveBeenCalledTimes(1)
    expect(req.payload.db.createVersion).toHaveBeenCalledTimes(2)
  })

  it('does not duplicate a version when retrying an already synchronized operation', async () => {
    req.payload.db.findVersions.mockResolvedValue(
      mock<PaginatedDocs<TypeWithVersion<Product>>>({
        docs: [
          mock<TypeWithVersion<Product>>({
            id: 'version',
            version: original,
            updatedAt: original.updatedAt,
          }),
        ],
      }),
    )
    await updateAtomically({ collection: 'products', id: original.id, req, update: () => null })
    expect(write).not.toHaveBeenCalled()
    expect(req.payload.db.createVersion).not.toHaveBeenCalled()
  })

  it('does not publish an older snapshot over a newer synchronized version', async () => {
    req.payload.db.findVersions.mockResolvedValue(
      mock<PaginatedDocs<TypeWithVersion<Product>>>({
        docs: [
          mock<TypeWithVersion<Product>>({
            id: 'newer',
            version: committed,
            updatedAt: committed.updatedAt,
          }),
        ],
      }),
    )
    await updateAtomically({ collection: 'products', id: original.id, req, update: () => null })
    expect(req.payload.db.findVersions).toHaveBeenCalledTimes(1)
    expect(req.payload.db.createVersion).not.toHaveBeenCalled()
  })
})
