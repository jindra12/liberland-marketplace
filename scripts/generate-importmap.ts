import 'dotenv/config'
import 'tsconfig-paths/register'

import { generateImportMap } from 'payload'
import config from '../src/payload.config'

const main = async () => {
  const resolvedConfig = await config

  await generateImportMap(resolvedConfig, {
    force: true,
    log: true,
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
