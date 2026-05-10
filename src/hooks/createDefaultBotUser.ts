import type { CollectionAfterChangeHook } from 'payload'

type CreateDefaultBotUserIfMissingArgs = {
  botUserExists: boolean
  createBotUser: () => Promise<void>
  isBotUser: boolean
}

export const createDefaultBotUserIfMissing = async ({
  botUserExists,
  createBotUser,
  isBotUser,
}: CreateDefaultBotUserIfMissingArgs): Promise<boolean> => {
  if (isBotUser || botUserExists) {
    return false
  }

  await createBotUser()

  return true
}

export const createDefaultBotUser: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') return doc

  const isBotUser = typeof doc === 'object' && doc !== null && Reflect.get(doc, 'bot') === true

  if (isBotUser) {
    return doc
  }

  const existingBots = await req.payload.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
    where: {
      bot: {
        equals: true,
      },
    },
  })

  await createDefaultBotUserIfMissing({
    botUserExists: existingBots.totalDocs > 0,
    createBotUser: async () => {
      const botPassword = process.env.CHATGPT_BOT_PASSWORD || process.env.CHATGPT_KEY

      await req.payload.db.create({
        collection: 'users',
        data: {
          bot: true,
          ...(botPassword
            ? {
                password: botPassword,
              }
            : {}),
          email: 'chatgpt-bot@liberland.marketplace',
          emailVerified: true,
          name: 'ChatGPT',
          role: ['user'],
        },
        req,
      })
    },
    isBotUser,
  })

  return doc
}
