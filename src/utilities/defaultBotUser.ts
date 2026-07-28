export type DefaultBotUserCredentials = {
  email: string
  password: string
}

export type DefaultBotUserData = {
  bot: true
  email: string
  emailVerified: true
  name: 'ChatGPT'
  password: string
  role: ['user']
}

export const getDefaultBotUserCredentials = (): DefaultBotUserCredentials | null => {
  const password = process.env.CHATGPT_KEY || null

  if (!password) {
    return null
  }

  return {
    email: process.env.CHATGPT_BOT_EMAIL || 'chatgpt-bot@liberland.marketplace',
    password,
  }
}

export const getDefaultBotUserData = (credentials: DefaultBotUserCredentials): DefaultBotUserData => {
  return {
    bot: true,
    email: credentials.email,
    emailVerified: true,
    name: 'ChatGPT',
    password: credentials.password,
    role: ['user'],
  }
}
