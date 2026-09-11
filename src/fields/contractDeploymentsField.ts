import type { Field } from 'payload'

const CONTRACT_ADDRESS_MAX_LENGTH = 128

const contractAddressField = (name: string, label: string): Field => ({
  name,
  label,
  type: 'text',
  maxLength: CONTRACT_ADDRESS_MAX_LENGTH,
})

export const contractDeploymentsField = (): Field => ({
  name: 'contractDeployments',
  label: 'Contract Deployments',
  type: 'array',
  admin: {
    description:
      'Addresses for the token, exchange, DAO, reward token, PoolManager, and their implementations. Keep one entry per deployed chain.',
    initCollapsed: true,
  },
  labels: {
    plural: 'Contract Deployments',
    singular: 'Contract Deployment',
  },
  fields: [
    {
      name: 'chain',
      label: 'Chain',
      type: 'select',
      required: true,
      options: [
        { label: 'Ethereum', value: 'ethereum' },
        { label: 'TRON', value: 'tron' },
      ],
    },
    contractAddressField('deployerWalletAddress', 'Deployer Wallet Address'),
    contractAddressField('poolManagerAddress', 'PoolManager Address'),
    contractAddressField('exchangePoolAddress', 'Exchange Pool Address'),
    contractAddressField('exchangePoolId', 'Exchange Pool ID'),
    contractAddressField('tokenAddress', 'Token Address'),
    contractAddressField('swapRouterAddress', 'Swap Router Address'),
    contractAddressField('rewardTokenAddress', 'Reward Token Address'),
    contractAddressField('daoAddress', 'DAO Address'),
    contractAddressField('tokenImplementationAddress', 'Token Implementation Address'),
    contractAddressField('swapRouterImplementationAddress', 'Swap Router Implementation Address'),
    contractAddressField('rewardTokenImplementationAddress', 'Reward Token Implementation Address'),
    contractAddressField('daoImplementationAddress', 'DAO Implementation Address'),
  ],
})
