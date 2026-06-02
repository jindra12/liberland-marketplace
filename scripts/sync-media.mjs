import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const projectRoot = process.cwd()
const sourceDir = process.env.MEDIA_SOURCE_DIR
const composeProject = process.env.MEDIA_COMPOSE_PROJECT

const findAppContainer = async () => {
  if (!composeProject) {
    throw new Error('MEDIA_COMPOSE_PROJECT is required.')
  }

  const { stdout } = await execFileAsync('docker', [
    'ps',
    '--filter',
    `label=com.docker.compose.project=${composeProject}`,
    '--filter',
    'label=com.docker.compose.service=app',
    '--format',
    '{{.Names}}',
  ])

  const names = stdout
    .split('\n')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  if (names.length === 0) {
    throw new Error(`No running app container found for compose project "${composeProject}".`)
  }

  return names[0]
}

const run = async () => {
  if (!sourceDir) {
    throw new Error('MEDIA_SOURCE_DIR is required.')
  }

  const mediaDir = path.resolve(projectRoot, sourceDir)
  await fs.access(mediaDir)
  const containerName = await findAppContainer()

  await execFileAsync('docker', ['exec', containerName, 'mkdir', '-p', '/app/public/media'])
  await execFileAsync('docker', ['cp', `${mediaDir}/.`, `${containerName}:/app/public/media/`])

  console.log(`[sync-media] copied ${mediaDir} into ${containerName}`)
}

run().catch((error) => {
  console.error('[sync-media] failed:', error)
  process.exitCode = 1
})
