import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export const withInstallerFixture = (
  check: (root: string, output: string, status: number | null, stderr: string) => void,
  options: {
    script?: 'installer' | 'maildev' | 'cron'
    reusedSecret?: string
    chatgptKey?: string
    allowFailure?: boolean
    interactive?: boolean
  } = {},
) => {
  const root = mkdtempSync(path.join(tmpdir(), 'marketplace-installer-security-'))
  try {
    mkdirSync(path.join(root, 'bin'))
    copyFileSync(
      path.resolve('tests/integration/security-regressions/installer/command-stub.sh'),
      path.join(root, 'command-stub.sh'),
    )
    // Symlink dispatchers are executables only inside the private fixture directory.
    const executable = path.join(root, 'command-stub.sh')
    const script = path.join(root, 'script.sh')
    const scriptName = options.script || 'installer'
    const sources = {
      installer: 'deploy-space.sh',
      maildev: 'maildev.sh',
      cron: 'scripts/ai-repost-cron.sh',
    }
    copyFileSync(path.resolve(sources[scriptName]), script)
    const reuse = path.join(root, 'reuse.env')
    writeFileSync(reuse, options.reusedSecret ? `SMTP_PASS=${options.reusedSecret}\n` : '')
    const commands = ['docker', 'git', 'curl', 'nginx', 'certbot', 'systemctl', 'pnpm', 'sleep']
    commands.forEach((name) => symlinkSync(executable, path.join(root, 'bin', name)))
    const environment = {
      PATH: `${root}/bin:/usr/bin:/bin`,
      HOME: root,
      FIXTURE_DIR: root,
      INSTALL_ROOT: path.join(root, 'install'),
      APP_SUBDOMAIN: 'security-fixture',
      SILENT: options.interactive ? 'false' : 'true',
      SYNDICATION_NAME: 'Disposable fixture',
      SYNDICATION_DESCRIPTION: 'Disposable fixture description',
      BLOCK_NON_ADMIN_CONTENT_CREATION: 'false',
      CHATGPT_KEY: options.chatgptKey ?? 'fixture-key',
      PAYLOAD_SECRET: 'fixture-payload-secret',
      BETTER_AUTH_SECRET: 'fixture-auth-secret',
      CRON_SECRET: 'fixture-cron-secret',
      PREVIEW_SECRET: 'fixture-preview-secret',
      MONGO_INITDB_ROOT_PASSWORD: 'fixture-root-password',
      MONGO_APP_PASSWORD: 'fixture-app-password',
      NGINX_SITES_AVAILABLE_DIR: path.join(root, 'nginx-available'),
      NGINX_SITES_ENABLED_DIR: path.join(root, 'nginx-enabled'),
    }
    const result = spawnSync(
      'bwrap',
      [
        '--ro-bind',
        '/',
        '/',
        '--unshare-all',
        '--tmpfs',
        '/root',
        '--tmpfs',
        '/run',
        '--tmpfs',
        '/tmp',
        '--bind',
        root,
        root,
        '--proc',
        '/proc',
        '--dev',
        '/dev',
        '--die-with-parent',
        '--clearenv',
        ...Object.entries(environment).flatMap(([key, value]) => ['--setenv', key, value]),
        '--chdir',
        root,
        '/bin/bash',
        '-c',
        'umask 022; chmod 755 "$1"; shift; exec /bin/bash "$@"',
        'fixture',
        executable,
        script,
        ...(scriptName === 'installer'
          ? [...(options.interactive ? [] : ['--silent']), '--reuse-env', reuse]
          : []),
      ],
      { encoding: 'utf8', timeout: 10000, input: options.interactive ? '\n' : '' },
    )
    if (result.error) {
      throw result.error
    }
    if (
      (scriptName === 'installer' && result.status !== 0 && !options.allowFailure) ||
      (scriptName === 'cron' && result.status !== 37)
    ) {
      throw new Error(
        `Installer fixture failed (${result.status}): ${result.stdout}\n${result.stderr}`,
      )
    }
    check(
      root,
      scriptName === 'maildev'
        ? String(result.status)
        : existsSync(path.join(root, 'commands.log'))
          ? readFileSync(path.join(root, 'commands.log'), 'utf8')
          : '',
      result.status,
      result.stderr,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}
