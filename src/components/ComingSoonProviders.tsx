import Image from 'next/image'
import { Button } from '@/components/ui/button'

const providers = [
  { name: 'Liberland', icon: '/Flag_of_Liberland_Square.jpg' },
  { name: 'Prospera', icon: '/prospera_logo.jpg' },
  { name: 'Network School', icon: '/networkschoolofficial_logo.jpeg' },
  { name: 'Praxis', icon: '/Praxis_logo.svg' },
  { name: 'Arc', icon: null },
  { name: 'Sealand', icon: '/Coat_of_Arms_of_Sealand.png' },
]

export const ComingSoonProviders: React.FC<{ action: 'Sign in' | 'Sign up' }> = ({ action }) => (
  <div className="relative">
    <div className="grid grid-cols-2 gap-2">
      {providers.map((provider) => (
        <Button
          key={provider.name}
          variant="outline"
          className="flex h-auto gap-2 py-2.5"
          type="button"
          disabled
        >
          {provider.icon ? (
            <Image
              src={provider.icon}
              alt={provider.name}
              width={20}
              height={20}
              className="shrink-0 rounded-sm"
            />
          ) : (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-muted text-xs font-bold">
              {provider.name[0]}
            </span>
          )}
          <span className="truncate text-xs">
            {action} with {provider.name}
          </span>
        </Button>
      ))}
    </div>
    <div className="absolute inset-0 flex items-center justify-center rounded-md bg-white/60 dark:bg-black/60">
      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">Coming soon</span>
    </div>
  </div>
)
