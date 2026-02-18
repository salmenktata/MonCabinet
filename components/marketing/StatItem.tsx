interface StatItemProps {
  value: string
  label: string
  delay?: string
}

export function StatItem({ value, label, delay = '' }: StatItemProps) {
  return (
    <div className={`text-center animate-fade-in-up ${delay}`}>
      <div className="text-3xl md:text-4xl font-bold gradient-gold-text mb-1">{value}</div>
      <div className="text-sm text-slate-300">{label}</div>
    </div>
  )
}
