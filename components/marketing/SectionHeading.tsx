interface SectionHeadingProps {
  badge?: string
  title: string
  subtitle?: string
  center?: boolean
}

export function SectionHeading({ badge, title, subtitle, center = true }: SectionHeadingProps) {
  return (
    <div className={center ? 'text-center' : ''}>
      {badge && (
        <div className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-4`}>
          {badge}
        </div>
      )}
      <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 animate-fade-in-up">
        {title}
      </h2>
      {subtitle && (
        <p className="text-lg text-slate-300 max-w-2xl mx-auto animate-fade-in-up stagger-1">
          {subtitle}
        </p>
      )}
    </div>
  )
}
