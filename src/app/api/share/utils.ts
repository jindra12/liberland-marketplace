import * as cheerio from 'cheerio'

import type { Where } from 'payload'

export class ShareApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ShareApiError'
    this.status = status
  }
}

export type ShareMetadata = {
  description: string
  imageURL: string | null
  isSinglePageApp: boolean
  title: string
}

export type ShareCompany = {
  createdBy?: string | { id?: string } | null
  id: string
  name: string
  noAutoPost?: boolean | null
}

export type ShareUser = {
  bot?: boolean | null
  id: string
  role?: string[] | null
}

export type SharePayload = {
  find: (options: {
    collection: 'companies'
    depth: 0
    limit: 1
    overrideAccess: boolean
    sort?: string
    user: ShareUser
    where?: Where
  }) => Promise<{
    docs: ShareCompany[]
    totalDocs: number
  }>
  findByID: (options: {
    collection: 'companies'
    depth: 0
    id: string
    overrideAccess: boolean
    user: ShareUser
  }) => Promise<ShareCompany>
}

const getMetaValue = (
  $: cheerio.CheerioAPI,
  selectors: string[],
  attributeName: 'content' | 'href' = 'content',
): string | null => {
  const element = selectors
    .map((selector) => $(selector).first())
    .find((entry) => entry.length > 0)

  if (!element) {
    return null
  }

  const value = element.attr(attributeName)

  return value || null
}

const normalizeText = (value: string): string => {
  return value.replace(/\s+/g, ' ').replace(/&nbsp;/g, ' ')
}

const resolveURL = (value: string | null, baseURL: URL): string | null => {
  if (!value) {
    return null
  }

  try {
    return new URL(value, baseURL).toString()
  } catch {
    return null
  }
}

const getLargestParagraph = ($: cheerio.CheerioAPI): string | null => {
  const paragraphs = $('p').toArray()

  return (
    paragraphs
      .map((paragraph) => normalizeText($(paragraph).text()))
      .reduce((largest, current) => (current.length > largest.length ? current : largest), '') || null
  )
}

const getFirstHeading = ($: cheerio.CheerioAPI): string | null => {
  const heading = $('h1').first().text()

  return heading || null
}

const getLargestImageURL = ($: cheerio.CheerioAPI, baseURL: URL): string | null => {
  const largestImage = $('img')
    .toArray()
    .map((image, index) => {
      const $image = $(image)
      const width = Number($image.attr('width') || 0)
      const height = Number($image.attr('height') || 0)
      const area = width > 0 && height > 0 ? width * height : 0
      const src = $image.attr('src') || $image.attr('data-src') || ''

      return {
        area,
        index,
        src,
      }
    })
    .sort((left, right) => right.area - left.area || left.index - right.index)[0]

  return resolveURL(largestImage?.src || null, baseURL)
}

const detectSinglePageApp = ($: cheerio.CheerioAPI): boolean => {
  const appShellMarkers = $('#root, #app, #__next, [data-reactroot], [data-spa-root]')
  const scriptCount = $('script').length

  return appShellMarkers.length > 0 || scriptCount > 3
}

export const extractShareMetadataFromHTML = async ({
  html,
  pageURL,
}: {
  html: string
  pageURL: string
}): Promise<ShareMetadata> => {
  const baseURL = new URL(pageURL)
  const $ = cheerio.load(html)

  const headTitle =
    getMetaValue($, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) || $('title').first().text() || null
  const headDescription = getMetaValue(
    $,
    ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]'],
  )
  const headImage = resolveURL(
    getMetaValue($, ['meta[property="og:image"]', 'meta[name="twitter:image"]', 'link[rel="image_src"]'], 'content') ||
      getMetaValue($, ['link[rel="image_src"]'], 'href'),
    baseURL,
  )
  const isSinglePageApp = detectSinglePageApp($) || (!headTitle && !headDescription && !headImage)

  return {
    description: headDescription || getLargestParagraph($) || '',
    imageURL: headImage || getLargestImageURL($, baseURL),
    isSinglePageApp,
    title: headTitle || getFirstHeading($) || baseURL.hostname,
  }
}

export const resolveShareCompany = async ({
  companyId,
  payload,
  user,
}: {
  companyId: string | null
  payload: SharePayload
  user: ShareUser | null
}): Promise<ShareCompany> => {
  if (!user) {
    throw new ShareApiError('Unauthorized.', 401)
  }

  if (user.role?.includes('admin') || Boolean(user.bot)) {
    if (companyId) {
      return payload.findByID({
        collection: 'companies',
        depth: 0,
        id: companyId,
        overrideAccess: false,
        user,
      })
    }

    const companyResult = await payload.find({
      collection: 'companies',
      depth: 0,
      limit: 1,
      overrideAccess: false,
      sort: 'createdAt',
      user,
    })

    const company = companyResult.docs[0]

    if (!company) {
      throw new ShareApiError('No company was found for the current user.', 404)
    }

    return company
  }

  const ownedCompanyWhere: Where = {
    createdBy: {
      equals: user.id,
    },
  }

  const where: Where = companyId
    ? {
        and: [
          ownedCompanyWhere,
          {
            id: {
              equals: companyId,
            },
          },
        ],
      }
    : ownedCompanyWhere

  const companyResult = await payload.find({
    collection: 'companies',
    depth: 0,
    limit: 1,
    overrideAccess: false,
    sort: 'createdAt',
    user,
    where,
  })

  const company = companyResult.docs[0]

  if (!company) {
    throw new ShareApiError(
      companyId ? 'You do not own that company.' : 'No company was found for the current user.',
      companyId ? 403 : 404,
    )
  }

  return company
}
