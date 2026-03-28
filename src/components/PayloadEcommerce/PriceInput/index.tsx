type PriceInputProps = Parameters<(typeof import('@payloadcms/plugin-ecommerce/rsc'))['PriceInput']>[0]

const PriceInput = async (props: PriceInputProps) => {
  const { PriceInput: DefaultPriceInput } = await import('@payloadcms/plugin-ecommerce/rsc')

  return <DefaultPriceInput {...props} />
}

export default PriceInput
