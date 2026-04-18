import { RequiredDataFromCollectionSlug } from 'payload'
import type { PostArgs } from './post-1'

export const post3: (args: PostArgs) => RequiredDataFromCollectionSlug<'posts'> = ({
  heroImage,
  blockImage,
  author,
  company,
}) => {
  return {
    slug: 'dollar-and-sense-the-financial-forecast',
    _status: 'published',
    createdBy: author.id,
    company: company.id,
    authors: [author],
    content: `# Dollar and Sense: The Financial Forecast

Money is a language of value, trust, and decision-making.

## Stock Market Dynamics

The market is a mix of opportunity and risk. Good decisions depend on discipline, context, and timing.
`,
    heroImage: heroImage.id,
    meta: {
      description:
        'A practical look at market dynamics, strategy, and the way sentiment shapes financial decisions.',
      image: heroImage.id,
      title: 'Dollar and Sense: The Financial Forecast',
    },
    relatedPosts: [], // this is populated by the seed script
    title: 'Dollar and Sense: The Financial Forecast',
  }
}
