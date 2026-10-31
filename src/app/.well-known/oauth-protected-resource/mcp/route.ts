import { getPoppyService } from '@/poppy/runtime/utils'

export const dynamic = 'force-dynamic'
export const GET = async () => Response.json((await getPoppyService()).protectedResourceMetadata(), { headers: { 'Cache-Control': 'no-store' } })
