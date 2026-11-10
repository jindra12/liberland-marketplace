import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { mockDeep } from 'vitest-mock-extended'
import type { MigrateUpArgs } from '@payloadcms/db-mongodb'
import { ObjectId } from 'mongodb'
import fs from 'node:fs/promises'

vi.mock('node:fs/promises', () => ({
  default: { mkdir: vi.fn(), access: vi.fn(), writeFile: vi.fn(), copyFile: vi.fn() },
}))
vi.stubEnv('BLOB_READ_WRITE_TOKEN', '')
const { up } = await import('@/migrations/20260426_130000_migrate_media_from_vercel_blob')
afterAll(() => vi.unstubAllEnvs())

describe('Media migration per-record recovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('continues migrating healthy records after one remote asset is unavailable', async () => {
    const args = mockDeep<MigrateUpArgs>()
    const healthyID = new ObjectId()
    vi.mocked(fs.access).mockRejectedValue(new Error('File absent in isolated fixture'))
    args.payload.db.collections.media.collection.find.mockReturnValue(
      mockDeep<ReturnType<typeof args.payload.db.collections.media.collection.find>>({
        toArray: async () => [
          {
            _id: new ObjectId(),
            filename: 'broken.png',
            url: 'https://fixture.blob.vercel-storage.com/broken.png',
          },
          {
            _id: healthyID,
            filename: 'healthy.png',
            url: 'https://fixture.blob.vercel-storage.com/healthy.png',
          },
        ],
      }),
    )
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockImplementation(
          async (input) =>
            new Response('fixture', { status: String(input).includes('healthy.png') ? 200 : 404 }),
        ),
    )
    await expect(up(args)).resolves.toBeUndefined()
    expect(args.payload.db.collections.media.collection.updateOne).toHaveBeenCalledWith(
      { _id: healthyID },
      expect.objectContaining({ $set: expect.objectContaining({ url: '/media/healthy.png' }) }),
      { session: args.session },
    )
  })

  it('never rewrites the database URL when copying an asset fails', async () => {
    const args = mockDeep<MigrateUpArgs>()
    vi.mocked(fs.access).mockRejectedValue(new Error('File absent in isolated fixture'))
    vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error('Isolated disk failure'))
    args.payload.db.collections.media.collection.find.mockReturnValue(
      mockDeep<ReturnType<typeof args.payload.db.collections.media.collection.find>>({
        toArray: async () => [
          {
            _id: new ObjectId(),
            filename: 'asset.png',
            url: 'https://fixture.blob.vercel-storage.com/asset.png',
          },
        ],
      }),
    )
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('fixture')))
    await expect(up(args)).rejects.toThrow('Isolated disk failure')
    expect(args.payload.db.collections.media.collection.updateOne).not.toHaveBeenCalled()
  })
})
