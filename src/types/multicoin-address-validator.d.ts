declare module 'multicoin-address-validator' {
  type Network = 'prod' | 'testnet' | 'both'

  type Validator = {
    validate: (address: string, currency: string, networkType?: Network) => boolean
  }

  const WAValidator: Validator
  export default WAValidator
}
