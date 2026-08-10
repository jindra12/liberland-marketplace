import { invalidateRagIndex } from '@/ai/rag/service'

const getCronSecret = (): string | null => process.env.CRON_SECRET || process.env.PAYLOAD_SECRET || null

export const POST = async (request: Request): Promise<Response> => {
  const secret = getCronSecret()

  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  invalidateRagIndex()

  return Response.json({ success: true })
}
