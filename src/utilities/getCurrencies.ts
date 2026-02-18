import type { OptionObject } from 'payload'

export type CurrencyCode =
  | 'USD'
  | 'EUR'
  | 'SGD'
  | 'GBP'
  | 'HNL'
  | 'ETH'
  | 'BTC'
  | 'USDC'
  | 'XMR'
  | 'LLD'
  | 'LLM'

export type CurrencyType = 'fiat' | 'crypto'

export interface CurrencyInfo {
  code: CurrencyCode
  label: string
  type: CurrencyType
  symbol?: string
}

export const currencies: CurrencyInfo[] = [
  // Fiat
  { code: 'USD', label: 'US Dollar', type: 'fiat', symbol: '$' },
  { code: 'EUR', label: 'Euro', type: 'fiat', symbol: '\u20AC' },
  { code: 'GBP', label: 'British Pound', type: 'fiat', symbol: '\u00A3' },
  { code: 'SGD', label: 'Singapore Dollar', type: 'fiat', symbol: 'S$' },
  { code: 'HNL', label: 'Honduran Lempira', type: 'fiat', symbol: 'L' },
  // Crypto
  { code: 'BTC', label: 'Bitcoin', type: 'crypto', symbol: '\u20BF' },
  { code: 'ETH', label: 'Ethereum', type: 'crypto', symbol: '\u039E' },
  { code: 'USDC', label: 'USD Coin', type: 'crypto' },
  { code: 'XMR', label: 'Monero', type: 'crypto' },
  { code: 'LLD', label: 'Liberland Dollar', type: 'crypto' },
  { code: 'LLM', label: 'Liberland Merit', type: 'crypto' },
]

export const getCurrencyInfo = (code: CurrencyCode): CurrencyInfo | undefined =>
  currencies.find((c) => c.code === code)

export const getCurrencies = (): OptionObject[] =>
  currencies.map((c) => ({
    label: `${c.code} \u2014 ${c.label}`,
    value: c.code,
  }))

export const getFiatCurrencies = (): OptionObject[] =>
  currencies.filter((c) => c.type === 'fiat').map((c) => ({
    label: `${c.code} \u2014 ${c.label}`,
    value: c.code,
  }))

export const getCryptoCurrencies = (): OptionObject[] =>
  currencies.filter((c) => c.type === 'crypto').map((c) => ({
    label: `${c.code} \u2014 ${c.label}`,
    value: c.code,
  }))
