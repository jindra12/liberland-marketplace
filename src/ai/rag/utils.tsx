import { createHash } from 'node:crypto'
import { OpenAIEmbedding } from '@llamaindex/openai'
import type { Payload } from 'payload'

/** Cache document vectors separately, avoiding MongoDB's per-document size limit. */
export const createPersistedEmbeddingModel = (
  payload: Pick<Payload, 'kv'>,
  options: ConstructorParameters<typeof OpenAIEmbedding>[0],
): OpenAIEmbedding => {
  const model = new OpenAIEmbedding(options)
  const generate = model.getTextEmbeddings
  model.getTextEmbeddings = async (texts) => {
    const entries = await Promise.all(texts.map(async (text) => {
      const hash = createHash('sha256').update(JSON.stringify([model.model, text])).digest('hex')
      const key = `rag:embedding:v1:${hash}`
      return { text, key, vector: await payload.kv.get<number[]>(key) }
    }))
    const missing = entries.filter((entry) => !entry.vector)
    const generated = missing.length ? await generate(missing.map((entry) => entry.text)) : []
    if (generated.length !== missing.length) {
      throw new Error('The embedding provider returned an incomplete document batch.')
    }
    await Promise.all(missing.map((entry, index) => payload.kv.set(entry.key, generated[index])))
    const newlyStored = new Map(missing.map((entry, index) => [entry.key, generated[index]]))
    return entries.map((entry) => entry.vector || newlyStored.get(entry.key)!)
  }
  return model
}
