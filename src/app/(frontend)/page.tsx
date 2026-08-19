import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const HomePage = async () => {
  redirect('/admin')
}

export default HomePage
