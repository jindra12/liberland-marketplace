export const loadAiRepostRunner = async () => {
  if (!process.env.CHATGPT_KEY) {
    return null
  }

  return import('./run')
}
