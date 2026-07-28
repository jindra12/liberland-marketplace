import 'dotenv/config'

import { createPayloadRequest } from 'payload'

import config from '../src/payload.config.ts'
import { reindexSearch } from '../src/search/reindex.ts'

const main = async () => {
  const resolvedConfig = await config
  const req = await createPayloadRequest({
    canSetHeaders: false,
    config: resolvedConfig,
    request: new Request('http://localhost/reindex-search'),
  })

  const reindexService = {
    payload: {
      create: (args) => req.payload.create({ ...args, req }),
      deleteMany: (args) => req.payload.db.deleteMany({ ...args }),
      find: (args) => req.payload.find({ ...args, req }),
      findByID: (args) => req.payload.findByID({ ...args, req }),
      logger: req.payload.logger,
    },
  }

  req.payload.logger.info('Reindexing search documents...')

  const counts = await reindexSearch(reindexService)

  req.payload.logger.info(
    `Search reindex complete: ${counts.map((entry) => `${entry.collection}=${entry.count}`).join(', ')}`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
