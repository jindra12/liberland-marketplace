import { hkdfSync } from 'node:crypto'
import { CompactEncrypt, compactDecrypt } from 'jose'
import type { JsonObject } from '@datalayer/personal-agent-protocol/server'

export const createPoppyEncryption = (secret: string) => {
  const key = new Uint8Array(hkdfSync('sha256', secret, 'nswap-poppy', 'protocol-state-v1', 32))
  return {
    encrypt: async (value: JsonObject, recordId: string): Promise<string> =>
      new CompactEncrypt(new TextEncoder().encode(JSON.stringify(value)))
        .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', kid: recordId })
        .encrypt(key),
    decrypt: async (value: string, recordId: string): Promise<JsonObject> => {
      const decrypted = await compactDecrypt(value, key, {
        keyManagementAlgorithms: ['dir'],
        contentEncryptionAlgorithms: ['A256GCM'],
      })
      if (decrypted.protectedHeader.kid !== recordId) {
        throw new Error('Poppy state record identity mismatch')
      }
      return JSON.parse(new TextDecoder().decode(decrypted.plaintext))
    },
  }
}
