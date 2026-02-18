export function BackgroundBlobs({ variant = 'default' }: { variant?: 'default' | 'blue' | 'amber' }) {
  const colors = {
    default: { c1: 'bg-blue-500/10', c2: 'bg-amber-500/5', c3: 'bg-blue-500/5' },
    blue: { c1: 'bg-blue-500/15', c2: 'bg-blue-400/5', c3: 'bg-blue-600/5' },
    amber: { c1: 'bg-amber-500/10', c2: 'bg-amber-400/5', c3: 'bg-blue-500/5' },
  }
  const { c1, c2, c3 } = colors[variant]

  return (
    <div className="fixed inset-0 pointer-events-none">
      <div className={`absolute top-0 left-1/4 w-96 h-96 ${c1} rounded-full blur-3xl`} />
      <div className={`absolute bottom-0 right-1/4 w-96 h-96 ${c2} rounded-full blur-3xl`} />
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] ${c3} rounded-full blur-3xl`} />
    </div>
  )
}
