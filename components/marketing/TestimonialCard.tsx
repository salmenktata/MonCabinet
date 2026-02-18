interface TestimonialCardProps {
  quote: string
  author: string
  role: string
  initial: string
  delay?: string
}

export function TestimonialCard({ quote, author, role, initial, delay = '' }: TestimonialCardProps) {
  return (
    <div className={`glass rounded-2xl p-6 animate-fade-in-up ${delay}`}>
      <div className="flex items-center gap-1 mb-4">
        {[1, 2, 3, 4, 5].map((star) => (
          <svg key={star} className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <blockquote className="text-white italic mb-6 leading-relaxed">
        &ldquo;{quote}&rdquo;
      </blockquote>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white font-bold">
          {initial}
        </div>
        <div>
          <p className="font-semibold text-white text-sm">{author}</p>
          <p className="text-xs text-slate-400">{role}</p>
        </div>
      </div>
    </div>
  )
}
