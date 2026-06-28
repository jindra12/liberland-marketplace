import { describe, expect, it } from 'vitest'
import { config as loadEnv } from 'dotenv'
import OpenAI from 'openai'
import chunk from 'lodash/chunk'
import path from 'node:path'

import { AI_REPOST_BATCH_SIZE, AI_REPOST_SOCIAL_DOMAINS } from '@/ai/reposts/constants'
import { buildRepostContent, discoverBatchRepostPlans } from '@/ai/reposts/utils'

loadEnv({ path: path.resolve(process.cwd(), '.env') })

const shouldRunLiveTest = process.env.RUN_LIVE_AI_REPOST_TEST === 'true'

const liveDescribe = shouldRunLiveTest ? describe : describe.skip

const getRealCompanies = () => {
  return [
    {
      description: 'OpenAI builds AI systems and consumer tools.',
      id: 'openai',
      name: 'OpenAI',
      website: 'https://openai.com',
    },
    {
      description: 'Anthropic builds AI research and products.',
      id: 'anthropic',
      name: 'Anthropic',
      website: 'https://www.anthropic.com',
    },
    {
      description: 'Google develops search, cloud, Android, and AI products.',
      id: 'google',
      name: 'Google',
      website: 'https://www.google.com',
    },
    {
      description: 'Microsoft builds cloud, software, and AI products.',
      id: 'microsoft',
      name: 'Microsoft',
      website: 'https://www.microsoft.com',
    },
    {
      description: 'NVIDIA makes GPUs and AI hardware/software.',
      id: 'nvidia',
      name: 'NVIDIA',
      website: 'https://www.nvidia.com',
    },
    {
      description: 'Apple makes consumer devices and software.',
      id: 'apple',
      name: 'Apple',
      website: 'https://www.apple.com',
    },
    {
      description: 'Meta builds social platforms and AI products.',
      id: 'meta',
      name: 'Meta',
      website: 'https://about.meta.com',
    },
    {
      description: 'Amazon operates e-commerce and cloud infrastructure.',
      id: 'amazon',
      name: 'Amazon',
      website: 'https://www.amazon.com',
    },
    {
      description: 'Tesla makes electric vehicles and energy products.',
      id: 'tesla',
      name: 'Tesla',
      website: 'https://www.tesla.com',
    },
    {
      description: 'Stripe provides internet payment infrastructure.',
      id: 'stripe',
      name: 'Stripe',
      website: 'https://stripe.com',
    },
    {
      description: 'Cloudflare provides internet security and infrastructure.',
      id: 'cloudflare',
      name: 'Cloudflare',
      website: 'https://www.cloudflare.com',
    },
    {
      description: 'Coinbase runs a crypto platform and exchange.',
      id: 'coinbase',
      name: 'Coinbase',
      website: 'https://www.coinbase.com',
    },
    {
      description: 'Kraken operates a crypto exchange.',
      id: 'kraken',
      name: 'Kraken',
      website: 'https://www.kraken.com',
    },
    {
      description: 'Binance operates a global crypto exchange.',
      id: 'binance',
      name: 'Binance',
      website: 'https://www.binance.com',
    },
    {
      description: 'Shopify powers online stores and commerce tooling.',
      id: 'shopify',
      name: 'Shopify',
      website: 'https://www.shopify.com',
    },
    {
      description: 'Discord provides community chat and voice tools.',
      id: 'discord',
      name: 'Discord',
      website: 'https://discord.com',
    },
    {
      description: 'Reddit runs a large community discussion platform.',
      id: 'reddit',
      name: 'Reddit',
      website: 'https://www.reddit.com',
    },
    {
      description: 'GitHub hosts developer code and collaboration tools.',
      id: 'github',
      name: 'GitHub',
      website: 'https://github.com',
    },
    {
      description: 'Canva provides design and content creation tools.',
      id: 'canva',
      name: 'Canva',
      website: 'https://www.canva.com',
    },
    {
      description: 'Figma provides collaborative design software.',
      id: 'figma',
      name: 'Figma',
      website: 'https://www.figma.com',
    },
    {
      description: 'Notion provides workspace and notes software.',
      id: 'notion',
      name: 'Notion',
      website: 'https://www.notion.com',
    },
    {
      description: 'Perplexity provides an AI search product.',
      id: 'perplexity',
      name: 'Perplexity',
      website: 'https://www.perplexity.ai',
    },
    {
      description: 'Runway builds AI media tools.',
      id: 'runway',
      name: 'Runway',
      website: 'https://runwayml.com',
    },
    {
      description: 'Duolingo makes language-learning software.',
      id: 'duolingo',
      name: 'Duolingo',
      website: 'https://www.duolingo.com',
    },
    {
      description: 'Uber runs ride-hailing and delivery services.',
      id: 'uber',
      name: 'Uber',
      website: 'https://www.uber.com',
    },
    {
      description: 'Lyft runs ride-hailing services.',
      id: 'lyft',
      name: 'Lyft',
      website: 'https://www.lyft.com',
    },
    {
      description: 'Airbnb provides travel and lodging bookings.',
      id: 'airbnb',
      name: 'Airbnb',
      website: 'https://www.airbnb.com',
    },
    {
      description: 'Spotify streams music and podcasts.',
      id: 'spotify',
      name: 'Spotify',
      website: 'https://www.spotify.com',
    },
    {
      description: 'Netflix streams video entertainment.',
      id: 'netflix',
      name: 'Netflix',
      website: 'https://www.netflix.com',
    },
    {
      description: 'Disney runs media, entertainment, and parks.',
      id: 'disney',
      name: 'Disney',
      website: 'https://www.disney.com',
    },
    {
      description: 'The New York Times publishes news coverage.',
      id: 'nytimes',
      name: 'The New York Times',
      website: 'https://www.nytimes.com',
    },
    {
      description: 'Reuters publishes global news coverage.',
      id: 'reuters',
      name: 'Reuters',
      website: 'https://www.reuters.com',
    },
    {
      description: 'Associated Press publishes global news coverage.',
      id: 'apnews',
      name: 'Associated Press',
      website: 'https://apnews.com',
    },
    {
      description: 'BBC News publishes global news coverage.',
      id: 'bbc',
      name: 'BBC News',
      website: 'https://www.bbc.com/news',
    },
    {
      description: 'CNN publishes global news coverage.',
      id: 'cnn',
      name: 'CNN',
      website: 'https://www.cnn.com',
    },
    {
      description: 'TechCrunch publishes startup and tech news.',
      id: 'techcrunch',
      name: 'TechCrunch',
      website: 'https://techcrunch.com',
    },
    {
      description: 'The Verge covers consumer tech news.',
      id: 'the-verge',
      name: 'The Verge',
      website: 'https://www.theverge.com',
    },
    {
      description: 'Wired covers tech and culture.',
      id: 'wired',
      name: 'WIRED',
      website: 'https://www.wired.com',
    },
    {
      description: 'Bloomberg covers business and markets.',
      id: 'bloomberg',
      name: 'Bloomberg',
      website: 'https://www.bloomberg.com',
    },
    {
      description: 'Reuters runs global business and breaking news coverage.',
      id: 'reuters-business',
      name: 'Reuters Business',
      website: 'https://www.reuters.com/business',
    },
    {
      description: 'Wall Street Journal covers business and markets.',
      id: 'wsj',
      name: 'The Wall Street Journal',
      website: 'https://www.wsj.com',
    },
    {
      description: 'Hacker News covers startup and developer news.',
      id: 'hacker-news',
      name: 'Hacker News',
      website: 'https://news.ycombinator.com',
    },
  ]
}

const isAllowedResultHost = (
  url: string,
  companies: Array<{
    id: string
    website?: string | null
  }>,
): boolean => {
  const hostname = new URL(url).hostname.replace(/^www\./, '')

  if (AI_REPOST_SOCIAL_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    return true
  }

  return companies.some((company) => {
    if (!company.website) {
      return false
    }

    const companyHost = new URL(company.website).hostname.replace(/^www\./, '')

    return hostname === companyHost || hostname.endsWith(`.${companyHost}`)
  })
}

const toSlug = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

type CreatedPostPayload = {
  _status: 'published'
  company: string
  content: string
  heroImage: string | null
  meta: {
    description: string
    image: string | null
    title: string
  }
  repost: string
  slug: string
  title: string
}

const buildCreatedPostPayloads = (
  discovered: Awaited<ReturnType<typeof discoverBatchRepostPlans>>,
): CreatedPostPayload[] => {
  const runTimestamp = Date.now()

  return discovered
    .filter((entry) => Boolean(entry.candidate.url))
    .map((entry) => {
      return {
        _status: 'published',
        company: entry.companyId,
        content: buildRepostContent({
          description: entry.decision.description,
        }),
        heroImage: entry.candidate.imageURL,
        meta: {
          description: entry.decision.description,
          image: entry.candidate.imageURL,
          title: entry.decision.title,
        },
        repost: entry.candidate.url,
        slug: `${toSlug(entry.decision.title)}-${entry.companyId}-${runTimestamp}`,
        title: entry.decision.title,
      }
    })
}

liveDescribe('ai repost live discovery', () => {
  it('discovers recent public social posts for real companies', async () => {
    const key = process.env.CHATGPT_KEY

    expect(key, 'CHATGPT_KEY is required for the live AI repost test.').toBeTruthy()

    const client = new OpenAI({
      apiKey: key,
      dangerouslyAllowBrowser: true,
    })

    const companies = getRealCompanies()
    const batches = chunk(companies, AI_REPOST_BATCH_SIZE)
    const discovered = (
      await Promise.all(
        batches.map(async (companyBatch) => {
          const batchPlans = await discoverBatchRepostPlans({
            client,
            companies: companyBatch,
          })

          return batchPlans
        }),
      )
    ).flat()

    const createdPosts = buildCreatedPostPayloads(discovered)
    console.log(JSON.stringify(createdPosts, null, 2))

    expect(companies.length).toBeGreaterThanOrEqual(40)
    expect(batches.length).toBe(Math.ceil(companies.length / AI_REPOST_BATCH_SIZE))
    expect(batches.every((batch) => batch.length <= AI_REPOST_BATCH_SIZE)).toBe(true)
    expect(discovered.every((candidate) => companies.some((company) => company.id === candidate.companyId))).toBe(true)
    expect(discovered.every((candidate) => isAllowedResultHost(candidate.candidate.url, companies))).toBe(true)
  }, 120_000)
})
