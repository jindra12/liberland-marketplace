import { RequiredDataFromCollectionSlug } from 'payload'
import type { PostArgs } from './post-1'

export const post2: (args: PostArgs) => RequiredDataFromCollectionSlug<'posts'> = ({
  heroImage,
  blockImage,
  author,
  company,
}) => {
  return {
    slug: 'global-gaze',
    createdBy: author.id,
    company: company.id,
    _status: 'published',
    authors: [author],
    content: `# Global Gaze

Explore the untold and overlooked. A magnified view into the corners of the world, where every story deserves its spotlight.

## The Power of Resilience

Throughout history, regions across the globe have faced the impact of natural disasters, political unrest, and economic downturns. Resilience turns crisis into recovery.

![Global perspective](https://example.com/global-gaze.jpg)
`,
    heroImage: heroImage.id,
    meta: {
      description:
        'Explore the untold and overlooked. A magnified view into the corners of the world, where every story deserves its spotlight.',
      image: heroImage.id,
      title: 'Global Gaze: Beyond the Headlines',
    },
    relatedPosts: [], // this is populated by the seed script
    title: 'Global Gaze: Beyond the Headlines',
  }
}
