'use client'

import { StanceProvider } from '@/contexts/StanceContext'

export function StanceProviderWrapper({ children }: { children: React.ReactNode }) {
  return <StanceProvider>{children}</StanceProvider>
}
