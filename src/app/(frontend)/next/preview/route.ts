import { getPayload } from 'payload'

import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextRequest } from 'next/server'

import configPromise from '@payload-config'

export const dynamic = 'force-dynamic'

export const GET = async (req: NextRequest): Promise<Response> => {
  const payload = await getPayload({ config: configPromise })

  const { searchParams } = new URL(req.url)

  const path = searchParams.get('path')
  const collection = searchParams.get('collection')
  const slug = searchParams.get('slug')
  const previewSecret = searchParams.get('previewSecret')

  if (previewSecret !== process.env.PREVIEW_SECRET) {
    return new Response('You are not allowed to preview this page', { status: 403 })
  }

  if (!path || !collection || !slug) {
    return new Response('Insufficient search params', { status: 404 })
  }

  const destination = new URL(path, req.url)
  if (!path.startsWith('/') || destination.origin !== req.nextUrl.origin) {
    return new Response('This endpoint can only be used for same-origin previews', { status: 400 })
  }

  const { user } = await payload.auth({ headers: req.headers })

  const draft = await draftMode()

  if (!user) {
    draft.disable()
    return new Response('You are not allowed to preview this page', { status: 403 })
  }

  // You can add additional checks here to see if the user is allowed to preview this page

  draft.enable()

  redirect(destination.pathname + destination.search + destination.hash)
}
