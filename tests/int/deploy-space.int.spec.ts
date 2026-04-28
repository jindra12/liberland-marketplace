import { execFile } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { promisify } from 'node:util'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const deployScriptPath = path.resolve(process.cwd(), 'deploy-space.sh')
const deployTimeoutMs = 120_000
const deployScriptText = readFileSync(deployScriptPath, 'utf8')

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

const waitForFileRemoval = async (filePath: string) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (!existsSync(filePath)) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  throw new Error(`Timed out waiting for ${filePath} to be removed`)
}

const getAvailablePort = async () => {
  const server = net.createServer()

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      resolve()
    })
  })

  const address = server.address()

  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine an available port.')
  }

  const port = address.port

  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve()
    })
  })

  return port
}

describe('deploy-space installer', () => {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'deploy-space-int-'))
  const repoWorkDir = path.join(fixtureRoot, 'repo-work')
  const bareRepoDir = path.join(fixtureRoot, 'repo-bare.git')
  const installRoot = path.join(fixtureRoot, 'install-normal')
  const silentInstallRoot = path.join(fixtureRoot, 'install-silent')
  const reuseInstallRoot = path.join(fixtureRoot, 'install-reuse')
  const stubBinDir = path.join(fixtureRoot, 'bin')
  const composeStateFile = path.join(fixtureRoot, 'compose-state.pid')
  const silentComposeStateFile = path.join(fixtureRoot, 'compose-state-silent.pid')
  const reuseComposeStateFile = path.join(fixtureRoot, 'compose-state-reuse.pid')
  const graphqlHitFile = path.join(fixtureRoot, 'graphql-hit.json')
  const silentGraphqlHitFile = path.join(fixtureRoot, 'graphql-hit-silent.json')
  let appPort = 0

  beforeAll(async () => {
    mkdirSync(repoWorkDir, { recursive: true })
    mkdirSync(stubBinDir, { recursive: true })
    appPort = await getAvailablePort()

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
        "import fs from 'node:fs'",
        "import http from 'node:http'",
        "const branch = process.env.DEPLOY_SPACE_BRANCH || 'unknown'",
        `const port = Number(process.env.DEPLOY_SPACE_TEST_PORT || ${appPort})`,
        "const server = http.createServer((request, response) => {",
        "  if (request.url === '/deploy-space') {",
        "    response.writeHead(200, { 'content-type': 'text/x-shellscript; charset=utf-8' })",
        "    response.end(process.env.DEPLOY_SPACE_SCRIPT_TEXT || '')",
        '    return',
        '  }',
        "  if (request.url === '/api/graphql' && request.method === 'POST') {",
        "    let body = ''",
        "    request.setEncoding('utf8')",
        "    request.on('data', (chunk) => {",
        '      body += chunk',
        '    })',
        "    request.on('end', () => {",
        "      const hitFile = process.env.DEPLOY_SPACE_GRAPHQL_HIT_FILE",
        "      if (hitFile) {",
        "        fs.writeFileSync(hitFile, body, 'utf8')",
        '      }',
        "      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })",
        "      response.end(JSON.stringify({ data: { createSyndication: { id: 'syndication-1' } }, extensions: { capturedRequest: body } }))",
        '    })',
        '    return',
        '  }',
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
      "import fs from 'node:fs'",
      "import http from 'node:http'",
      "const branch = process.env.DEPLOY_SPACE_BRANCH || 'feature'",
      `const port = Number(process.env.DEPLOY_SPACE_TEST_PORT || ${appPort})`,
      "const server = http.createServer((request, response) => {",
      "  if (request.url === '/deploy-space') {",
        "    response.writeHead(200, { 'content-type': 'text/x-shellscript; charset=utf-8' })",
        "    response.end(process.env.DEPLOY_SPACE_SCRIPT_TEXT || '')",
        '    return',
        '  }',
      "  if (request.url === '/api/graphql' && request.method === 'POST') {",
      "    let body = ''",
      "    request.setEncoding('utf8')",
      "    request.on('data', (chunk) => {",
      '      body += chunk',
      '    })',
      "    request.on('end', () => {",
      "      const hitFile = process.env.DEPLOY_SPACE_GRAPHQL_HIT_FILE",
      "      if (hitFile) {",
      "        fs.writeFileSync(hitFile, body, 'utf8')",
      '      }',
      "      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })",
      "      response.end(JSON.stringify({ data: { createSyndication: { id: 'syndication-1' } }, extensions: { capturedRequest: body } }))",
      '    })',
      '    return',
      '  }',
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
    'clones the requested branch, starts the installer, and submits a syndication draft',
    async () => {
      const env = {
        ...process.env,
        APP_SUBDOMAIN: 'marketplace',
        COMPOSE_STATE_FILE: composeStateFile,
        CODEX_NETWORK_ALLOW_LOCAL_BINDING: '1',
        DEPLOY_SPACE_GRAPHQL_HIT_FILE: graphqlHitFile,
        DEPLOY_SPACE_TEST_PORT: String(appPort),
        DEPLOY_SPACE_SCRIPT_TEXT: deployScriptText,
        INSTALL_ROOT: installRoot,
        PATH: `${stubBinDir}:${process.env.PATH || ''}`,
        REPO_URL: bareRepoDir,
        SYNDICATION_DESCRIPTION: 'Deployment created from the installer.',
        SYNDICATION_NAME: 'Marketplace mirror',
      }

      const { stdout } = await execFileAsync(
        deployScriptPath,
        [
          '--branch',
          'feature',
          '--server',
          `http://127.0.0.1:${appPort}`,
        ],
        {
          env,
          maxBuffer: 20 * 1024 * 1024,
        },
      )

      const adminUrl = 'https://marketplace.203-0-113-10.nip.io/admin'
      expect(stdout).toContain(`Admin: ${adminUrl}`)
      expect(stdout).toContain('Installer: https://marketplace.203-0-113-10.nip.io/deploy-space')
      expect(stdout).toContain(`Installer source: http://127.0.0.1:${appPort}/deploy-space`)
      expect(stdout).toContain('Syndication draft payload:')

      await waitForServer(`http://127.0.0.1:${appPort}/admin`)

      const scriptResponse = await fetch(`http://127.0.0.1:${appPort}/deploy-space`)
      expect(scriptResponse.status).toBe(200)
      expect(scriptResponse.headers.get('content-type')).toContain('text/x-shellscript')
      expect(await scriptResponse.text()).toContain('Usage: deploy-space.sh')
      expect(stdout).toContain('createSyndication')
      expect(stdout).toContain('Marketplace mirror')
      expect(stdout).toContain('Deployment created from the installer.')
      expect(stdout).toContain('https://marketplace.203-0-113-10.nip.io')
      expect(stdout).toContain('"draft":true')

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

      await waitForFileRemoval(composeStateFile)

      expect(existsSync(composeStateFile)).toBe(false)
    },
    deployTimeoutMs,
  )

  it(
    'skips syndication submission in silent mode',
    async () => {
      const env = {
        ...process.env,
        APP_SUBDOMAIN: 'marketplace',
        COMPOSE_STATE_FILE: silentComposeStateFile,
        CODEX_NETWORK_ALLOW_LOCAL_BINDING: '1',
        DEPLOY_SPACE_GRAPHQL_HIT_FILE: silentGraphqlHitFile,
        DEPLOY_SPACE_TEST_PORT: String(appPort),
        DEPLOY_SPACE_SCRIPT_TEXT: deployScriptText,
        INSTALL_ROOT: silentInstallRoot,
        PATH: `${stubBinDir}:${process.env.PATH || ''}`,
        REPO_URL: bareRepoDir,
      }

      const { stdout } = await execFileAsync(
        deployScriptPath,
        [
          '--branch',
          'feature',
          '--server',
          `http://127.0.0.1:${appPort}`,
          '--silent',
        ],
        {
          env,
          maxBuffer: 20 * 1024 * 1024,
        },
      )

      expect(stdout).toContain(`Installer source: http://127.0.0.1:${appPort}/deploy-space`)
      expect(stdout).toContain('Skipping syndication draft submission because --silent was supplied.')
      expect(stdout).not.toContain('Syndication draft payload:')
      expect(stdout).not.toContain('createSyndication')
      expect(existsSync(silentGraphqlHitFile)).toBe(false)

      await waitForServer(`http://127.0.0.1:${appPort}/admin`)

      await execFileAsync(
        'docker',
        [
          'compose',
          '--env-file',
          path.join(silentInstallRoot, 'source', '.deploy', 'runtime.env'),
          '-f',
          path.join(silentInstallRoot, 'source', '.deploy', 'docker-compose.yml'),
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

      await waitForFileRemoval(silentComposeStateFile)

      expect(existsSync(silentComposeStateFile)).toBe(false)
    },
    deployTimeoutMs,
  )

  it(
    'reuses an existing env file on redeploy',
    async () => {
      mkdirSync(reuseInstallRoot, { recursive: true })
      await runGit(reuseInstallRoot, ['clone', bareRepoDir, 'source'])
      mkdirSync(path.join(reuseInstallRoot, 'source', '.deploy'), { recursive: true })

      writeFileSync(
        path.join(reuseInstallRoot, 'source', '.deploy', 'runtime.env'),
        [
          '# Generated by test',
          'APP_SUBDOMAIN="devserver"',
          'SYNDICATION_NAME="Devserver"',
          'SYNDICATION_DESCRIPTION="Devserver deployment"',
          '',
        ].join('\n'),
      )

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        CODEX_NETWORK_ALLOW_LOCAL_BINDING: '1',
        DEPLOY_SPACE_TEST_PORT: String(appPort),
        DEPLOY_SPACE_SCRIPT_TEXT: deployScriptText,
        INSTALL_ROOT: reuseInstallRoot,
        PATH: `${stubBinDir}:${process.env.PATH || ''}`,
        REPO_URL: bareRepoDir,
      }

      delete env.APP_DOMAIN
      delete env.APP_SUBDOMAIN
      delete env.SYNDICATION_DESCRIPTION
      delete env.SYNDICATION_NAME

      const { stdout } = await execFileAsync(
        deployScriptPath,
        [
          '--branch',
          'feature',
          '--server',
          `http://127.0.0.1:${appPort}`,
          '--reuse-env',
          path.join(reuseInstallRoot, 'source', '.deploy', 'runtime.env'),
        ],
        {
          env,
          maxBuffer: 20 * 1024 * 1024,
        },
      )

      expect(stdout).toContain(`Reusing existing environment from: ${path.join(reuseInstallRoot, 'source', '.deploy', 'runtime.env')}`)
      expect(stdout).toContain('Subdomain: devserver')
      expect(stdout).toContain('Domain: https://devserver.203-0-113-10.nip.io')
      expect(stdout).toContain('Devserver')

      await waitForServer(`http://127.0.0.1:${appPort}/admin`)

      await execFileAsync(
        'docker',
        [
          'compose',
          '--env-file',
          path.join(reuseInstallRoot, 'source', '.deploy', 'runtime.env'),
          '-f',
          path.join(reuseInstallRoot, 'source', '.deploy', 'docker-compose.yml'),
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

      await waitForFileRemoval(reuseComposeStateFile)

      expect(existsSync(reuseComposeStateFile)).toBe(false)
    },
    deployTimeoutMs,
  )
})
