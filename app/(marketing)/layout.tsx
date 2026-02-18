import { BackgroundBlobs } from '@/components/marketing/BackgroundBlobs'
import { MarketingHeader } from '@/components/marketing/MarketingHeader'
import { MarketingFooter } from '@/components/marketing/MarketingFooter'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-slate-950 text-white overflow-hidden">
      <BackgroundBlobs />
      <MarketingHeader />
      <main className="relative z-10">{children}</main>
      <MarketingFooter />
    </div>
  )
}
