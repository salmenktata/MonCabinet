import Link from 'next/link'

interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
  delay?: string
  href?: string
  accent?: 'blue' | 'amber' | 'emerald' | 'purple'
}

const accentColors = {
  blue: 'from-blue-500/20 to-blue-600/20 text-blue-400',
  amber: 'from-amber-500/20 to-amber-600/20 text-amber-400',
  emerald: 'from-emerald-500/20 to-emerald-600/20 text-emerald-400',
  purple: 'from-purple-500/20 to-purple-600/20 text-purple-400',
}

export function FeatureCard({ icon, title, description, delay = '', href, accent = 'blue' }: FeatureCardProps) {
  const content = (
    <div
      className={`group glass-card rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-500/10 animate-fade-in-up ${delay}`}
    >
      <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${accentColors[accent]} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-300 leading-relaxed">{description}</p>
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}
