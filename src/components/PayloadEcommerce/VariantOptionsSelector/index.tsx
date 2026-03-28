type VariantOptionsSelectorProps = Parameters<
  (typeof import('@payloadcms/plugin-ecommerce/rsc'))['VariantOptionsSelector']
>[0]

const VariantOptionsSelector = async (props: VariantOptionsSelectorProps) => {
  const { VariantOptionsSelector: DefaultVariantOptionsSelector } = await import(
    '@payloadcms/plugin-ecommerce/rsc'
  )

  return <DefaultVariantOptionsSelector {...props} />
}

export default VariantOptionsSelector
