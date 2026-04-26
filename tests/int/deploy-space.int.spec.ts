import { execFile } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const deployScriptPath = path.resolve(process.cwd(), 'deploy-space.sh')
const deployTimeoutMs = 120_000

const makeExecutable = (filePath: string, contents: string) => {
  writeFileSync(filePath, contents, 'utf8')
  chmodSync(filePath, 0o755)
}

const runGit = async (cwd: string, args: string[]) => {
  await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 })
}

const waitForServer = async (url: string) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // Retry until the stubbed server becomes ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  throw new Error(`Timed out waiting for ${url}`)
}

describe('deploy-space installer', () => {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'deploy-space-int-'))
  const repoWorkDir = path.join(fixtureRoot, 'repo-work')
  const bareRepoDir = path.join(fixtureRoot, 'repo-bare.git')
  const installRoot = path.join(fixtureRoot, 'install')
  const stubBinDir = path.join(fixtureRoot, 'bin')
  const composeStateFile = path.join(fixtureRoot, 'compose-state.pid')
  const appPort = 43111

  beforeAll(async () => {
    mkdirSync(repoWorkDir, { recursive: true })
    mkdirSync(stubBinDir, { recursive: true })

    await runGit(repoWorkDir, ['init', '--initial-branch=main'])
    await runGit(repoWorkDir, ['config', 'user.email', 'tester@example.com'])
    await runGit(repoWorkDir, ['config', 'user.name', 'Tester'])

    writeFileSync(
      path.join(repoWorkDir, 'package.json'),
      JSON.stringify(
        {
          name: 'deploy-space-fixture',
          private: true,
          scripts: {
            build: 'node -e "process.exit(0)"',
            start: 'node server.mjs',
          },
        },
        null,
        2,
      ),
    )
    writeFileSync(path.join(repoWorkDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n')
    writeFileSync(
      path.join(repoWorkDir, 'server.mjs'),
      [
        "import http from 'node:http'",
        "const branch = process.env.DEPLOY_SPACE_BRANCH || 'unknown'",
        `const port = Number(process.env.DEPLOY_SPACE_TEST_PORT || ${appPort})`,
        "const server = http.createServer((request, response) => {",
        "  if (request.url === '/admin') {",
        "    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })",
        "    response.end(`admin:${branch}`)",
        '    return',
        '  }',
        "  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })",
        "  response.end('not found')",
        '})',
        "server.listen(port, '127.0.0.1')",
        "setInterval(() => {}, 1 << 30)",
        '',
      ].join('\n'),
    )

    await runGit(repoWorkDir, ['add', '.'])
    await runGit(repoWorkDir, ['commit', '-m', 'main branch fixture'])
    await runGit(repoWorkDir, ['checkout', '-b', 'feature'])
    writeFileSync(path.join(repoWorkDir, 'server.mjs'), [
      "import http from 'node:http'",
      "const branch = process.env.DEPLOY_SPACE_BRANCH || 'feature'",
      `const port = Number(process.env.DEPLOY_SPACE_TEST_PORT || ${appPort})`,
      "const server = http.createServer((request, response) => {",
      "  if (request.url === '/admin') {",
      "    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })",
      "    response.end(`admin:${branch}`)",
      '    return',
      '  }',
      "  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })",
      "  response.end('not found')",
      '})',
      "server.listen(port, '127.0.0.1')",
      "setInterval(() => {}, 1 << 30)",
      '',
    ].join('\n'))
    await runGit(repoWorkDir, ['commit', '-am', 'feature branch fixture'])
    await runGit(repoWorkDir, ['checkout', 'main'])
    await execFileAsync('git', ['clone', '--bare', repoWorkDir, bareRepoDir], {
      maxBuffer: 10 * 1024 * 1024,
    })

    makeExecutable(
      path.join(stubBinDir, 'sudo'),
      `#!/usr/bin/env bash
set -euo pipefail
exec "$@"
`,
    )
    makeExecutable(
      path.join(stubBinDir, 'apt-get'),
      `#!/usr/bin/env bash
set -euo pipefail
exit 0
`,
    )
    makeExecutable(
      path.join(stubBinDir, 'systemctl'),
      `#!/usr/bin/env bash
set -euo pipefail
exit 0
`,
    )
    makeExecutable(
      path.join(stubBinDir, 'ufw'),
      `#!/usr/bin/env bash
set -euo pipefail
exit 0
`,
    )
    makeExecutable(
      path.join(stubBinDir, 'curl'),
      `#!/usr/bin/env bash
set -euo pipefail

if [[ "$*" == *"api.ipify.org"* ]]; then
  printf '203.0.113.10'
  exit 0
fi

exit 0
`,
    )
    const dockerStub = [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      '',
      'state_file="${COMPOSE_STATE_FILE:-${TMPDIR:-/tmp}/deploy-space-compose.pid}"',
      'port="${DEPLOY_SPACE_TEST_PORT:-43111}"',
      '',
      'if [[ "${1:-}" == "info" ]]; then',
      '  exit 0',
      'fi',
      '',
      'if [[ "${1:-}" == "compose" ]]; then',
      '  shift',
      '  compose_file=""',
      '  action=""',
      '',
      '  while [[ $# -gt 0 ]]; do',
      '    case "$1" in',
      '      -f)',
      '        compose_file="$2"',
      '        shift 2',
      '        ;;',
      '      --env-file)',
      '        shift 2',
      '        ;;',
      '      up|down)',
      '        action="$1"',
      '        shift',
      '        break',
      '        ;;',
      '      *)',
      '        shift',
      '        ;;',
      '    esac',
      '  done',
      '',
      '  if [[ -z "$compose_file" || -z "$action" ]]; then',
      '    echo "Missing compose file or action." >&2',
      '    exit 1',
      '  fi',
      '',
      '  source_dir="$(cd "$(dirname "$compose_file")/.." && pwd)"',
      '',
      '  if [[ "$action" == "up" ]]; then',
      '    branch="$(git -C "$source_dir" branch --show-current)"',
      '    branch="${branch:-main}"',
      `    python3 -c "import os, subprocess, sys; source_dir = sys.argv[1]; state_file = sys.argv[2]; branch = sys.argv[3]; port = sys.argv[4]; env = os.environ.copy(); env['DEPLOY_SPACE_BRANCH'] = branch; env['DEPLOY_SPACE_TEST_PORT'] = port; process = subprocess.Popen(['node', 'server.mjs'], cwd=source_dir, env=env, start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); open(state_file, 'w', encoding='utf-8').write(str(process.pid))" "$source_dir" "$state_file" "$branch" "$port"`,
      '    exit 0',
      '  fi',
      '',
      '  if [[ "$action" == "down" ]]; then',
      '    if [[ -f "$state_file" ]]; then',
      '      kill "$(cat "$state_file")" >/dev/null 2>&1 || true',
      '      rm -f "$state_file"',
      '    fi',
      '    exit 0',
      '  fi',
      'fi',
      '',
      'echo "Unsupported docker invocation: $*" >&2',
      'exit 1',
      '',
    ].join('\n')

    makeExecutable(path.join(stubBinDir, 'docker'), dockerStub)
  })

  afterAll(() => {
    rmSync(fixtureRoot, { force: true, recursive: true })
  })

  it(
    'clones the requested branch, starts the installer, and tears it down cleanly',
    async () => {
      const env = {
        ...process.env,
        APP_DOMAIN: 'marketplace-203-0-113-10.nip.io',
        BETTER_AUTH_SECRET: 'better-auth-secret',
        COMPOSE_STATE_FILE: composeStateFile,
        CODEX_NETWORK_ALLOW_LOCAL_BINDING: '1',
        DEPLOY_SPACE_TEST_PORT: String(appPort),
        CRON_SECRET: 'cron-secret',
        PAYLOAD_SECRET: 'payload-secret',
        PREVIEW_SECRET: 'preview-secret',
        INSTALL_ROOT: installRoot,
        PATH: `${stubBinDir}:${process.env.PATH || ''}`,
        REPO_URL: bareRepoDir,
        SMTP_FROM_ADDRESS: 'noreply@example.com',
        SMTP_FROM_NAME: 'Liberland Marketplace',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PASS: 'smtp-pass',
        SMTP_PORT: '587',
        SMTP_USER: 'smtp-user',
        THIRDWEB_SECRET_KEY: 'thirdweb-secret-key',
        THIRDWEB_CLIENT_ID: 'thirdweb-client-id',
        TRONWEB_API: 'https://tron.example.com',
        TRONWEB_SECRET: 'tron-secret',
      }

      const { stdout } = await execFileAsync(deployScriptPath, ['--branch', 'feature'], {
        env,
        maxBuffer: 20 * 1024 * 1024,
      })

      const adminUrl = 'https://marketplace-203-0-113-10.nip.io/admin'
      expect(stdout).toContain(`Admin: ${adminUrl}`)

      await waitForServer(`http://127.0.0.1:${appPort}/admin`)

      const response = await fetch(`http://127.0.0.1:${appPort}/admin`)
      expect(response.status).toBe(200)
      expect(await response.text()).toBe('admin:feature')

      await execFileAsync(
        'docker',
        [
          'compose',
          '--env-file',
          path.join(installRoot, 'source', '.deploy', 'runtime.env'),
          '-f',
          path.join(installRoot, 'source', '.deploy', 'docker-compose.yml'),
          'down',
          '--remove-orphans',
        ],
        {
          env: {
            ...env,
            PATH: `${stubBinDir}:${process.env.PATH || ''}`,
          },
          maxBuffer: 10 * 1024 * 1024,
        },
      )

      await new Promise((resolve) => setTimeout(resolve, 200))
      await expect(fetch(`http://127.0.0.1:${appPort}/admin`)).rejects.toThrow()
      expect(existsSync(composeStateFile)).toBe(false)
    },
    deployTimeoutMs,
  )
})
