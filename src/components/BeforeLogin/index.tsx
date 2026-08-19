import React from 'react'
import Link from 'next/link'

const BeforeLogin: React.FC = () => {
  return (
    <div>
      <p>
        <b>Welcome to your dashboard!</b>
        {' This is where site admins will log in to manage your website.'}
      </p>
      <p>
        Need a marketplace account? <Link href="/signup">Create one here.</Link>
      </p>
    </div>
  )
}

export default BeforeLogin
