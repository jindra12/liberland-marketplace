import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

type TargetCollection = 'jobs' | 'products' | 'startups'

type ForeignCompanyCreateResult = {
  docID: null | string
  errorMessage: null | string
  fatalMessage: null | string
  success: boolean
  target: TargetCollection
}

const execFileAsync = promisify(execFile)
const nodeCommand = process.execPath
const runnerPath = path.resolve(process.cwd(), 'tests/int/access/foreign-company-create.runner.ts')
const resultPrefix = 'RESULT_JSON:'
const runnerTimeout = 30_000

const parseRunnerResult = (output: string, target: TargetCollection): ForeignCompanyCreateResult => {
  const resultLine = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .reverse()
    .find((line) => line.startsWith(resultPrefix))

  if (!resultLine) {
    throw new Error(`Missing runner result for ${target}.\n${output}`)
  }

  return JSON.parse(resultLine.slice(resultPrefix.length)) as ForeignCompanyCreateResult
}

const runForeignCompanyCreateAttempt = async (
  target: TargetCollection,
): Promise<ForeignCompanyCreateResult> => {
  const { stderr, stdout } = await execFileAsync(
    nodeCommand,
    ['--import', 'tsx/esm', runnerPath, target],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NO_LIVE_CRYPTO_TESTS: 'true',
      },
      maxBuffer: 10 * 1024 * 1024,
    },
  )

  return parseRunnerResult(`${stdout}\n${stderr}`, target)
}

describe('foreign company create protections', () => {
  it(
    'rejects creating a job under another user company',
    async () => {
      const result = await runForeignCompanyCreateAttempt('jobs')

      expect(result).toMatchObject({
        fatalMessage: null,
        success: false,
      })
      expect(result.errorMessage).toBeTruthy()
    },
    runnerTimeout,
  )

  it(
    'rejects creating a startup under another user company',
    async () => {
      const result = await runForeignCompanyCreateAttempt('startups')

      expect(result).toMatchObject({
        fatalMessage: null,
        success: false,
      })
      expect(result.errorMessage).toBeTruthy()
    },
    runnerTimeout,
  )

  it(
    'rejects creating a product under another user company',
    async () => {
      const result = await runForeignCompanyCreateAttempt('products')

      expect(result).toMatchObject({
        fatalMessage: null,
        success: false,
      })
      expect(result.errorMessage).toBeTruthy()
    },
    runnerTimeout,
  )
})
