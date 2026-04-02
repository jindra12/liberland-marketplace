import WAValidator from 'multicoin-address-validator'
import type { Field, TextFieldSingleValidation } from 'payload'

type WalletChain = 'ethereum' | 'solana' | 'tron'

const walletChainOptions: Array<{ label: string; value: WalletChain }> = [
  { label: 'Ethereum', value: 'ethereum' },
  { label: 'Solana', value: 'solana' },
  { label: 'Tron', value: 'tron' },
]

const walletCurrencyByChain: Record<WalletChain, 'eth' | 'sol' | 'trx'> = {
  ethereum: 'eth',
  solana: 'sol',
  tron: 'trx',
}

const walletChainLabelByChain: Record<WalletChain, string> = {
  ethereum: 'Ethereum',
  solana: 'Solana',
  tron: 'Tron',
}

const isWalletChain = (value: string): value is WalletChain =>
  value === 'ethereum' || value === 'solana' || value === 'tron'

const validateWalletAddress: TextFieldSingleValidation = (value, { siblingData }) => {
  const address = typeof value === 'string' ? value.trim() : ''
  const chain =
    typeof siblingData === 'object' &&
    siblingData !== null &&
    'chain' in siblingData &&
    typeof siblingData.chain === 'string'
      ? siblingData.chain
      : ''

  if (!address) {
    return 'Wallet address is required.'
  }

  if (!isWalletChain(chain)) {
    return 'Select a chain first.'
  }

  return WAValidator.validate(address, walletCurrencyByChain[chain])
    ? true
    : `Please enter a valid ${walletChainLabelByChain[chain]} address.`
}

export const userWalletsField = (): Field => ({
  name: 'wallets',
  label: 'Wallets',
  type: 'array',
  admin: {
    description: 'Wallets available for this user across supported chains.',
    initCollapsed: true,
  },
  labels: {
    plural: 'Wallets',
    singular: 'Wallet',
  },
  fields: [
    {
      name: 'chain',
      label: 'Chain',
      type: 'select',
      options: walletChainOptions,
      required: true,
    },
    {
      name: 'provider',
      label: 'Provider',
      type: 'text',
      required: true,
    },
    {
      name: 'address',
      label: 'Wallet Address',
      type: 'text',
      required: true,
      validate: validateWalletAddress,
      hooks: {
        beforeChange: [({ value }) => (typeof value === 'string' ? value.trim() : value)],
      },
    },
  ],
})
