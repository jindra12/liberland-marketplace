import config from '@payload-config'
import type { Payload, PayloadRequest } from 'payload'
import { getPayload } from 'payload'

import { toStringID } from '@/utilities/toStringID'
import { fetchSafeURLResponse, resolveSafeURL } from './security'
import {
  ShareApiError,
  extractShareMetadataFromHTML,
  resolveShareCompany,
  type ShareUser,
} from './utils'

export type ShareRepostInput = {
  companyId: string | null
  description?: string | null
  link: string
}

export type ShareSource = {
  description: string
  imageURL: string | null
  isSinglePageApp: boolean
  link: string
  title: string
}

export type ShareRepostResult = {
  company: {
    id: string
    name: string
  }
  post: unknown
  source: ShareSource
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
  req,
  user,
  title,
}: {
  imageURL: string
  payload: Payload
  req?: PayloadRequest
  user: ShareUser
  title: string
  }): Promise<string | null> => {
  const targetURL = await resolveSafeURL(imageURL)

  if (!targetURL) {
    return null
  }

  const response = await fetchSafeURLResponse(targetURL)

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
    ...(req ? { req } : {}),
    user: req?.user ?? user,
  })

  return toStringID(media.id)
}

export const createShareRepost = async ({
  description,
  link,
  companyId,
  payload,
  user,
  req,
}: {
  companyId: string | null
  description?: string | null
  link: string
  payload: Payload
  req?: PayloadRequest
  user: ShareUser
}): Promise<ShareRepostResult> => {
  const targetURL = await resolveSafeURL(link)

  if (!targetURL) {
    throw new ShareApiError('link must be an http(s) URL.', 400)
  }

  const company = await resolveShareCompany({
    companyId,
    payload,
    user,
  })

  if (company.noAutoPost) {
    throw new ShareApiError('Automated posting is disabled for this company.', 403)
  }

  const response = await fetchSafeURLResponse(targetURL)

  if (!response.ok) {
    throw new ShareApiError(`Unable to fetch ${targetURL.toString()}.`, 400)
  }

  const contentType = response.headers.get('content-type') || ''

  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    throw new ShareApiError('link must point to an HTML page.', 400)
  }

  const html = await response.text()
  const metadata = await extractShareMetadataFromHTML({
    html,
    pageURL: targetURL.toString(),
  })
  const effectiveDescription = description || metadata.description
  const imageID = metadata.imageURL
    ? await createSharedImage({
        imageURL: metadata.imageURL,
        payload,
        req,
        title: metadata.title,
        user,
      })
    : null

  const content = effectiveDescription || ''

  const postData = {
    _status: 'published',
    company: company.id,
    content,
    heroImage: imageID || undefined,
    meta: {
      description: effectiveDescription,
      image: imageID || undefined,
      title: metadata.title,
    },
    repost: targetURL.toString(),
    title: metadata.title,
  } as Parameters<Payload['create']>[0]['data']

  const post = await payload.create({
    collection: 'posts',
    data: postData,
    draft: false,
    overrideAccess: false,
    ...(req ? { req } : {}),
    user,
  } as Parameters<Payload['create']>[0])

  return {
    company: {
      id: company.id,
      name: company.name,
    },
    post,
    source: {
      description: effectiveDescription,
      imageURL: metadata.imageURL,
      isSinglePageApp: metadata.isSinglePageApp,
      link: targetURL.toString(),
      title: metadata.title,
    },
  }
}

export const handleShareRequest = async (request: Request): Promise<Response> => {
  const payload = await getPayload({ config })
  const auth = await payload.auth({ headers: request.headers })
  const user = auth.user

  if (!user) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const shareURL = new URL(request.url)
  const link = shareURL.searchParams.get('link')
  const companyId = shareURL.searchParams.get('companyId')
  const description = shareURL.searchParams.get('description')

  if (!link) {
    return Response.json({ error: 'link is required.' }, { status: 400 })
  }

  try {
    const result = await createShareRepost({
      companyId,
      description,
      link,
      payload,
      user,
    })

    return Response.json(result)
  } catch (error) {
    if (error instanceof ShareApiError) {
      return Response.json({ error: error.message }, { status: error.status })
    }

    const message = error instanceof Error ? error.message : 'Failed to create a repost.'

    return Response.json({ error: message }, { status: 500 })
  }
}
