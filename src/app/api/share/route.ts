import config from '@payload-config'
import { getPayload } from 'payload'

import {
  ShareApiError,
  extractShareMetadataFromHTML,
  resolveShareCompany,
} from './utils'
import type { User } from '@/payload-types'

export const dynamic = 'force-dynamic'

const getSafeURL = (value: string): URL | null => {
  try {
    const parsed = new URL(value)

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

const getFileExtension = (mimeType: string): string => {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('gif')) return 'gif'
  if (mimeType.includes('avif')) return 'avif'
  if (mimeType.includes('svg')) return 'svg'
  return 'jpg'
}

const getImageFileName = (imageURL: string, mimeType: string): string => {
  const pathname = new URL(imageURL).pathname
  const lastSegment = pathname.split('/').pop() || 'share-image'

  if (lastSegment.includes('.')) {
    return lastSegment
  }

  return `${lastSegment}.${getFileExtension(mimeType)}`
}

const createSharedImage = async ({
  imageURL,
  payload,
  title,
  user,
}: {
  imageURL: string
  payload: Awaited<ReturnType<typeof getPayload>>
  title: string
  user: User
}): Promise<string | null> => {
  const response = await fetch(imageURL)

  if (!response.ok) {
    return null
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg'

  if (!mimeType.startsWith('image/')) {
    return null
  }

  const fileBuffer = Buffer.from(await response.arrayBuffer())
  const file = {
    data: fileBuffer,
    mimetype: mimeType,
    name: getImageFileName(imageURL, mimeType),
    size: fileBuffer.byteLength,
  }

  const media = await payload.create({
    collection: 'media',
    data: {
      alt: title,
    },
    file,
    draft: false,
    overrideAccess: false,
    user,
  } as Parameters<typeof payload.create>[0])

  return media.id
}

export const GET = async (request: Request): Promise<Response> => {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  const user = auth.user

  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const shareURL = new URL(request.url)
  const link = shareURL.searchParams.get('link')
  const companyId = shareURL.searchParams.get('companyId')

  if (!link) {
    return Response.json({ error: 'link is required.' }, { status: 400 })
  }

  const targetURL = getSafeURL(link)

  if (!targetURL) {
    return Response.json({ error: 'link must be an http(s) URL.' }, { status: 400 })
  }

  try {
    const company = await resolveShareCompany({
      companyId,
      payload,
      user,
    })

    if (company.noAutoPost) {
      return Response.json({ error: 'Automated posting is disabled for this company.' }, { status: 403 })
    }

    const response = await fetch(targetURL)

    if (!response.ok) {
      return Response.json({ error: `Unable to fetch ${targetURL.toString()}.` }, { status: 400 })
    }

    const contentType = response.headers.get('content-type') || ''

    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return Response.json({ error: 'link must point to an HTML page.' }, { status: 400 })
    }

    const html = await response.text()
    const metadata = await extractShareMetadataFromHTML({
      html,
      pageURL: targetURL.toString(),
    })

    const imageID =
      metadata.imageURL
        ? await createSharedImage({
            imageURL: metadata.imageURL,
            payload,
            title: metadata.title,
            user,
          })
        : null

    const content = metadata.description
      ? `${metadata.description}\n\n[Original content](${targetURL.toString()})`
      : `[Original content](${targetURL.toString()})`

    const postData = {
      _status: 'published',
      company: company.id,
      content,
      heroImage: imageID || undefined,
      meta: {
        description: metadata.description,
        image: imageID || undefined,
        title: metadata.title,
      },
      repost: targetURL.toString(),
      title: metadata.title,
    } as Parameters<typeof payload.create>[0]['data']

    const post = await payload.create({
      collection: 'posts',
      data: postData,
      draft: false,
      overrideAccess: false,
      user,
    } as Parameters<typeof payload.create>[0])

    return Response.json({
      company: {
        id: company.id,
        name: company.name,
      },
      post,
      source: {
        description: metadata.description,
        imageURL: metadata.imageURL,
        isSinglePageApp: metadata.isSinglePageApp,
        link: targetURL.toString(),
        title: metadata.title,
      },
    })
  } catch (error) {
    if (error instanceof ShareApiError) {
      return Response.json({ error: error.message }, { status: error.status })
    }

    const message = error instanceof Error ? error.message : 'Failed to create a repost.'

    return Response.json({ error: message }, { status: 500 })
  }
}
