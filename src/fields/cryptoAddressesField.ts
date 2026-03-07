import WAValidator from 'multicoin-address-validator'
import type { Field, TextFieldSingleValidation } from 'payload'

type WalletChain = 'ethereum' | 'solana' | 'tron'

const CHAIN_OPTIONS: Array<{ label: string; value: WalletChain }> = [
  { label: 'Ethereum', value: 'ethereum' },
  { label: 'Solana', value: 'solana' },
  { label: 'Tron', value: 'tron' },
]

const COIN_BY_CHAIN: Record<WalletChain, 'eth' | 'sol' | 'trx'> = {
  ethereum: 'eth',
  solana: 'sol',
  tron: 'trx',
}

const LABEL_BY_CHAIN: Record<WalletChain, string> = {
  ethereum: 'Ethereum',
  solana: 'Solana',
  tron: 'Tron',
}

const isWalletChain = (value: unknown): value is WalletChain =>
  value === 'ethereum' || value === 'solana' || value === 'tron'

const validateWalletAddress: TextFieldSingleValidation = (value, { siblingData }) => {
  const rawAddress = typeof value === 'string' ? value.trim() : ''
  const rawChain = (siblingData as { chain?: unknown } | undefined)?.chain

  if (!rawAddress && !rawChain) {
    return true
  }

  if (rawAddress && !isWalletChain(rawChain)) {
    return 'Select a wallet chain first.'
  }

  if (!rawAddress && isWalletChain(rawChain)) {
    return 'Address is required when chain is selected.'
  }

  if (!isWalletChain(rawChain)) {
    return 'Invalid wallet chain.'
  }

  return WAValidator.validate(rawAddress, COIN_BY_CHAIN[rawChain])
    ? true
    : `Please enter a valid ${LABEL_BY_CHAIN[rawChain]} address.`
}

export const cryptoAddressesField = (): Field => ({
  name: 'cryptoAddresses',
  label: 'Payout Wallet',
  type: 'group',
  admin: {
    description: 'Optional single payout wallet. If product wallet is empty, company wallet is used.',
  },
  fields: [
    {
      name: 'chain',
      label: 'Chain',
      type: 'select',
      options: CHAIN_OPTIONS,
    },
    {
      name: 'address',
      label: 'Wallet Address',
      type: 'text',
      validate: validateWalletAddress,
      hooks: {
        beforeChange: [
          ({ value }) => (typeof value === 'string' ? value.trim() : value),
        ],
      },
    },
  ],
})
