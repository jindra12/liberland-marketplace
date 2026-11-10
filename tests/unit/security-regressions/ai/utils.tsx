import { vi } from 'vitest'
import { mock, mockDeep } from 'vitest-mock-extended'
import {
  createLocalReq,
  ValidationError,
  type PaginatedDocs,
  type Payload,
  type PayloadRequest,
} from 'payload'
import type { Company, Media, Post, User } from '@/payload-types'
import { discoverBatchRepostPlans, discoverFallbackPosts } from '@/ai/reposts/utils'
import type { AiRepostDiscoveryClient } from '@/ai/reposts/utils'

export const createDiscoveryClient = (url: string): AiRepostDiscoveryClient => ({
  responses: {
    parse: async () => ({
      output_parsed: {
        items: [
          {
            companyId: 'eligible-company',
            title: 'Model candidate',
            description: 'Model candidate description',
            qualityScore: 90,
            reason: 'Model suggested it',
            shouldRepost: true,
            concernFlags: [],
            url,
          },
        ],
      },
    }),
  },
})

export const createRepostFixture = (imageURL: string | null = null) => {
  const payload = mockDeep<Payload>()
  const req = mockDeep<PayloadRequest>()
  const bot = mock<User & { collection: 'users' }>({
    id: 'bot',
    bot: true,
    role: ['user'],
    collection: 'users',
  })
  req.user = bot
  const posts: Post[] = []
  payload.find.mockImplementation(async (options) => {
    switch (options.collection) {
      case 'users':
        return Object.assign(mock<PaginatedDocs<User>>(), { docs: [bot] })
      case 'companies':
        return Object.assign(mock<PaginatedDocs<Company>>(), {
          docs: [mock<Company>({ id: 'company', name: 'Company', noAutoPost: false })],
        })
      default:
        return Object.assign(mock<PaginatedDocs<Post>>(), { docs: posts })
    }
  })
  payload.create.mockImplementation(async (options) => {
    if (options.collection === 'media') {
      return mock<Media>({ id: 'image' })
    }
    const repost =
      'repost' in options.data && typeof options.data.repost === 'string' ? options.data.repost : ''
    if (posts.some((post) => post.repost === repost)) {
      throw new ValidationError({
        errors: [{ path: 'aiPublicationKey', message: 'Value must be unique.' }],
      })
    }
    const post = mock<Post>({ id: `post-${posts.length}`, repost })
    posts.push(post)
    return post
  })
  vi.mocked(createLocalReq).mockResolvedValue(req)
  const plans: Awaited<ReturnType<typeof discoverBatchRepostPlans>> = [
    {
      companyId: 'company',
      isFallback: false,
      candidate: {
        url: 'https://news.example/article',
        title: 'Fixture article',
        description: 'Fixture description',
        imageURL,
        publishedAtISO: new Date().toISOString(),
      },
      decision: {
        companyId: 'company',
        url: 'https://news.example/article',
        shouldRepost: true,
        title: 'Fixture article',
        description: 'Fixture description',
        concernFlags: [],
        qualityScore: 90,
        reason: 'Fixture decision',
      },
    },
  ]
  vi.mocked(discoverBatchRepostPlans).mockResolvedValue(plans)
  vi.mocked(discoverFallbackPosts).mockResolvedValue([])
  return { payload, posts, plans }
}
