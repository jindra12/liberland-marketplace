import fs from 'node:fs/promises'
import path from 'node:path'

export const dynamic = 'force-dynamic'

const deployScriptPath = path.resolve(process.cwd(), 'deploy-space.sh')
const defaultServerUrlLine = 'SERVER_URL="${SERVER_URL:-https://backend.nswap.io}"'

export const GET = async (request: Request) => {
  const script = await fs.readFile(deployScriptPath, 'utf8')
  const serverUrl = new URL(request.url).origin
  const rewrittenScript = script.replace(
    defaultServerUrlLine,
    'SERVER_URL="${SERVER_URL:-' + serverUrl + '}"',
  )

  return new Response(rewrittenScript, {
    headers: {
      'cache-control': 'public, max-age=300',
      'content-disposition': 'inline; filename="deploy-space.sh"',
      'content-type': 'text/x-shellscript; charset=utf-8',
    },
  })
}
