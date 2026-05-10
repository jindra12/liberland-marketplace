import type { Config as GeneratedConfig } from './payload-types'

declare module 'payload' {
  export interface GeneratedTypes extends GeneratedConfig {}
}

export {}
