import fs from 'node:fs/promises'
import path from 'node:path'
import { getServerSideURL } from '@/utilities/getURL'

export const dynamic = 'force-dynamic'

const deployScriptPath = path.resolve(process.cwd(), 'deploy-space.sh')
const defaultServerUrlLine = 'SERVER_URL="${SERVER_URL:-https://backend.nswap.io}"'

export const GET = async (_request: Request) => {
  const script = await fs.readFile(deployScriptPath, 'utf8')
  const serverUrl = new URL(getServerSideURL()).origin
  const rewrittenScript = script.replace(
    defaultServerUrlLine,
    'SERVER_URL="${SERVER_URL:-' + serverUrl + '}"',
  )

  return new Response(rewrittenScript, {
    headers: {
      'cache-control': 'no-store',
      'content-disposition': 'inline; filename="deploy-space.sh"',
      'content-type': 'text/x-shellscript; charset=utf-8',
    },
  })
}
