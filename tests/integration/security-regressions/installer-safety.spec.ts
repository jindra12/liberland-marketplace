import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { withInstallerFixture } from './installer/utils'

describe('Installer data and secret safety', () => {
  it('does not request volume deletion during a normal installation', () => {
    withInstallerFixture((_root, commands) => expect(commands).not.toContain(' down -v '))
  })

  it('preserves runtime credentials when cleaning the downloaded source checkout', () => {
    withInstallerFixture((root) =>
      expect(existsSync(path.join(root, 'install/.deploy/runtime.env'))).toBe(true),
    )
  })

  it('includes persistent media storage in the generated app service', () => {
    withInstallerFixture((root) => {
      const config: { services: { app: { volumes?: Array<string | { target: string }> } } } = parse(
        readFileSync(path.join(root, 'generated-compose.yml'), 'utf8'),
      )
      const mounts = config.services.app.volumes || []
      expect(
        mounts.some((mount) =>
          typeof mount === 'string'
            ? mount.includes(':/app/public/media')
            : mount.target === '/app/public/media',
        ),
      ).toBe(true)
    })
  })

  it('does not make generated credentials readable by the group or other users', () => {
    withInstallerFixture((root) => {
      const mode = Number.parseInt(readFileSync(path.join(root, 'runtime-mode'), 'utf8'), 8)
      expect(mode & 0o077).toBe(0)
    })
  })

  it('does not pass the live CMS signing secret as an image build argument', () => {
    withInstallerFixture((root) => {
      const config: { services: { app: { build: { args?: Record<string, string>; secrets?: string[] } } } } = parse(
        readFileSync(path.join(root, 'generated-compose.yml'), 'utf8'),
      )
      expect(Object.values(config.services.app.build.args || {})).not.toContain('${PAYLOAD_SECRET}')
      expect(config.services.app.build.secrets).toContain('runtime-env')
    })
  })

  it('does not place the cron credential in the HTTP client process arguments', () => {
    withInstallerFixture(
      (_root, commands) => expect(commands).not.toContain('fixture-cron-secret'),
      { script: 'cron' },
    )
  })

  it('treats reused secrets as literal data rather than executable shell substitutions', () => {
    withInstallerFixture((root) => expect(existsSync(path.join(root, 'evaluated'))).toBe(false), {
      reusedSecret: 'literal-$(printf expanded > "$FIXTURE_DIR/evaluated")',
    })
  })

  it('does not report a successful maildev wrapper after its child fails', () => {
    withInstallerFixture((_root, status) => expect(status).not.toBe('0'), { script: 'maildev' })
  })
})
