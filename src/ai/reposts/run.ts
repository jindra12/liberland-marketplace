import { createLocalReq, type Payload } from 'payload'
import chunk from 'lodash/chunk'
import OpenAI from 'openai'

import type { User } from '@/payload-types'

import { AI_REPOST_BATCH_SIZE } from './constants'
import type { AiRepostCompany, AiRepostBatchPlan, AiSocialCandidate } from './types'
import { buildRepostContent, discoverBatchRepostPlans, discoverFallbackPosts } from './utils'

const isBotUser = (user: unknown): boolean => {
  if (!user || typeof user !== 'object' || !('bot' in user)) {
    return false
  }

  return (user as { bot?: unknown }).bot === true
}

const toSlug = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const getUniquePostSlug = (title: string, companyID: string): string => {
  return toSlug(`${title}-${companyID}-${Date.now()}`)
}

type AiBotSession = {
  request: Awaited<ReturnType<typeof createLocalReq>>
  user: {
    bot?: boolean | null
    id: string
    role?: string[] | null
  }
}

const getChatGPTKey = (): string | null => process.env.CHATGPT_KEY || null

const getOpenAIClient = (): OpenAI | null => {
  const key = getChatGPTKey()

  if (!key) {
    return null
  }

  return new OpenAI({ apiKey: key })
}

const getBotSession = async (payload: Payload): Promise<AiBotSession | null> => {
  const botEmail = process.env.CHATGPT_BOT_EMAIL || 'chatgpt-bot@liberland.marketplace'

  try {
    const result = await payload.find({
      collection: 'users',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        OR: [
          {
            bot: {
              equals: true,
            },
          },
          {
            email: {
              equals: botEmail,
            },
          },
        ],
      },
    })

    const botUser = result.docs.find((user): user is User => user.bot === true)

    if (!botUser || !isBotUser(botUser)) {
      return null
    }

    const botUserWithCollection = {
      ...botUser,
      collection: 'users' as const,
    }

    return {
      request: await createLocalReq({ user: botUserWithCollection }, payload),
      user: {
        bot: true,
        id: botUser.id.toString(),
        role: botUser.role,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    console.error('[ai-reposts] failed to load bot user', { error: message })
    throw new Error(`Failed to load the ChatGPT bot user: ${message}`)
  }
}

const uploadImage = async ({
  candidate,
  payload,
  req,
  title,
}: {
  candidate: AiSocialCandidate
  payload: Payload
  req: Awaited<ReturnType<typeof createLocalReq>>
  title: string
}): Promise<string | null> => {
  if (!candidate.imageURL) {
    return null
  }

  try {
    const response = await fetch(candidate.imageURL)

    if (!response.ok) {
      return null
    }

    const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg'

    if (!mimeType.startsWith('image/')) {
      return null
    }

    const fileBuffer = Buffer.from(await response.arrayBuffer())
    const media = await payload.create({
      collection: 'media',
      data: {
        alt: title,
        createdBy: req.user?.id ?? '',
      },
      file: {
        data: fileBuffer,
        mimetype: mimeType,
        name: 'ai-repost-image',
        size: fileBuffer.byteLength,
      },
      draft: false,
      overrideAccess: false,
      req,
      user: req.user,
    })

    return media.id.toString()
  } catch {
    return null
  }
}

const createRepost = async ({
  candidate,
  company,
  decision,
  payload,
  req,
  session,
}: {
  candidate: AiSocialCandidate
  company: AiRepostCompany
  decision: AiRepostBatchPlan
  payload: Payload
  req: Awaited<ReturnType<typeof createLocalReq>>
  session: AiBotSession
}): Promise<boolean> => {
  const heroImageID = await uploadImage({
    candidate,
    payload,
    req,
    title: decision.title,
  })

  const postData = {
    _status: 'published',
    createdBy: session.user.id,
    company: company.id,
    content: buildRepostContent({
      description: decision.description,
    }),
    heroImage: heroImageID || undefined,
    meta: {
      description: decision.description,
      image: heroImageID || undefined,
      title: decision.title,
    },
    repost: candidate.url,
    slug: getUniquePostSlug(decision.title, company.id),
    title: decision.title,
  } satisfies Parameters<typeof payload.create>[0]['data'] & {
    repost: string
  }

  await payload.create({
    collection: 'posts',
    data: postData,
    draft: false,
    overrideAccess: false,
    req,
    user: req.user,
  })

  return true
}

const getCompaniesForAutoRepost = async (payload: Payload): Promise<AiRepostCompany[]> => {
  const result = await payload.find({
    collection: 'companies',
    depth: 0,
    limit: 100,
    overrideAccess: false,
    pagination: false,
    sort: '-createdAt',
    where: {
      noAutoPost: {
        not_equals: true,
      },
    },
  })

  return result.docs as AiRepostCompany[]
}

export const runAiRepostCycle = async ({
  payload,
}: {
  payload: Payload
}): Promise<{
  created: number
  companiesScanned: number
  skipped: boolean
  skippedReason: string | null
}> => {
  if (!getChatGPTKey()) {
    return {
      created: 0,
      companiesScanned: 0,
      skipped: true,
      skippedReason: 'missing-chatgpt-key',
    }
  }

  const openai = getOpenAIClient()

  if (!openai) {
    return {
      created: 0,
      companiesScanned: 0,
      skipped: true,
      skippedReason: 'missing-chatgpt-key',
    }
  }

  const companies = await getCompaniesForAutoRepost(payload)
  const session = await getBotSession(payload)

  if (!session) {
    return {
      created: 0,
      companiesScanned: companies.length,
      skipped: true,
      skippedReason: 'missing-bot-credentials',
    }
  }

  const batchResults = await Promise.all(
    chunk(companies, AI_REPOST_BATCH_SIZE).map(async (companyBatch) => {
      const plans = await discoverBatchRepostPlans({
        client: openai,
        companies: companyBatch,
      })

      const companyByID = companyBatch.reduce<Record<string, AiRepostCompany>>((accumulator, company) => {
        accumulator[company.id] = company
        return accumulator
      }, {})

      const createdPosts = await Promise.all(
        plans.map(async ({ candidate, companyId, decision, isFallback }) => {
          const company = companyByID[companyId]

          if (!company || !decision.shouldRepost || (!isFallback && decision.qualityScore < 70)) {
            return 0
          }

          const created = await createRepost({
            candidate,
            company,
            decision,
            payload,
            req: session.request,
            session,
          })

          return created ? 1 : 0
        }),
      )

      return {
        created: createdPosts.reduce<number>((sum, value) => sum + value, 0),
        discovered: plans.length,
      }
    }),
  )

  const created = batchResults.reduce<number>((sum, result) => sum + result.created, 0)
  const discovered = batchResults.reduce<number>((sum, result) => sum + result.discovered, 0)
  const fallbackPosts = discovered === 0
    ? await discoverFallbackPosts({ client: openai, companies })
    : []
  console.info('[ai-reposts] discovery summary', {
    companiesScanned: companies.length,
    discovered,
    fallbackPosts: fallbackPosts.length,
  })
  const fallbackCreated = await Promise.all(
    fallbackPosts.map(async (fallbackPost) => {
      const fallbackCompany = companies.find((company) => company.id === fallbackPost.companyId)

      if (!fallbackCompany) {
        return false
      }

      return createRepost({
        candidate: fallbackPost.candidate,
        company: fallbackCompany,
        decision: fallbackPost.decision,
        payload,
        req: session.request,
        session,
      })
    }),
  )

  return {
    created: created + fallbackCreated.filter(Boolean).length,
    companiesScanned: companies.length,
    skipped: false,
    skippedReason: null,
  }
}
