import { describe, expect, it } from 'vitest'
import { withInstallerFixture } from './installer/utils'

describe('Installer required credential preflight', () => {
  it.each([false, true])(
    'rejects an empty bot credential before building or starting containers (interactive: %s)',
    (interactive) => {
      withInstallerFixture(
        (_root, commands, status, stderr) => {
          expect(status).not.toBe(0)
          expect(commands).not.toMatch(/\s(build|up)\s/)
          expect(stderr).toMatch(/CHATGPT_KEY|OpenAI API key/)
        },
        { chatgptKey: '', allowFailure: true, interactive },
      )
    },
  )
})
