import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const HomePage = async () => {
  redirect('https://nswap.io')
}

export default HomePage
