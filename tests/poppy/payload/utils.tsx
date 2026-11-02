import { randomUUID } from 'node:crypto'
import { buildConfig, getPayload, type Payload } from 'payload'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { PoppyProtocolState } from '@/collections/PoppyProtocolState'
import { ensurePoppyIndexes } from '@/poppy/collection/utils'

export const createPoppyTestPayload = async (name: string): Promise<Payload> => {
  const database = `poppy_test_${name}_${randomUUID()}`
  return getPayload({
    key: database,
    config: buildConfig({
      secret: 'poppy-payload-store-test-secret',
      db: mongooseAdapter({ url: `mongodb://127.0.0.1:27018/${database}`, ensureIndexes: true }),
      collections: [PoppyProtocolState],
      onInit: ensurePoppyIndexes,
      typescript: { autoGenerate: false },
    }),
  })
}

export const destroyPoppyTestPayload = async (payload: Payload): Promise<void> => {
  if (!payload.db.connection.name.startsWith('poppy_test_')) {
    throw new Error('Refusing to drop a database not owned by this test fixture')
  }
  await payload.db.connection.dropDatabase()
  await payload.destroy()
}
