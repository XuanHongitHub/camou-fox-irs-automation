import { cn } from '../../lib/utils'
import appLogo from '../../assets/app-logo.png'

export interface BrandMarkProps {
  className?: string
  alt?: string
}

export function BrandMark({ className, alt = 'Bug Forge' }: BrandMarkProps) {
  return <img src={appLogo} alt={alt} className={cn('object-cover', className)} />
}
