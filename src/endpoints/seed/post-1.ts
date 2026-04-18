import type { Media, User } from '@/payload-types'
import { RequiredDataFromCollectionSlug } from 'payload'

export type PostArgs = {
  heroImage: Media
  blockImage: Media
  author: User
  company: { id: string }
}

export const post1: (args: PostArgs) => RequiredDataFromCollectionSlug<'posts'> = ({
  heroImage,
  blockImage,
  author,
  company,
}) => {
  return {
    slug: 'digital-horizons',
    _status: 'published',
    createdBy: author.id,
    company: company.id,
    authors: [author],
    content: `# Digital Horizons: A Glimpse into Tomorrow

Dive into the marvels of modern innovation, where the only constant is change.

## The Rise of AI and Machine Learning

We find ourselves in a transformative era where artificial intelligence stands at the forefront of technological evolution. These systems are reshaping industries at an unprecedented pace.

## IoT: Connecting the World Around Us

The Internet of Things is weaving devices together into a more responsive and connected world.

### Example

\`\`\`js
async function generateText(prompt) {
  const apiKey = 'your-api-key'
  const apiUrl = 'https://api.example.com/generate-text'
  const response = await fetch(apiUrl, { method: 'POST' })
  return response.json()
}
\`\`\`
`,
    heroImage: heroImage.id,
    meta: {
      description:
        'Dive into the marvels of modern innovation, where the only constant is change. A journey where pixels and data converge to craft the future.',
      image: heroImage.id,
      title: 'Digital Horizons: A Glimpse into Tomorrow',
    },
    relatedPosts: [], // this is populated by the seed script
    title: 'Digital Horizons: A Glimpse into Tomorrow',
  }
}
