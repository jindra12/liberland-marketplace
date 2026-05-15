import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const deployScriptPath = path.resolve(process.cwd(), 'deploy-space.sh')
const deployScriptText = readFileSync(deployScriptPath, 'utf8')

describe('deploy-space.sh', () => {
  it('removes the mongo volume before starting the stack', () => {
    expect(deployScriptText).toContain('down -v --remove-orphans')
    expect(deployScriptText).toContain('up -d --build --remove-orphans')
  })
})
