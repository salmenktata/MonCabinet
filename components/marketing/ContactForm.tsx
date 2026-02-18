'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

export function ContactForm() {
  const t = useTranslations('marketing.contact.form')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const name = data.get('name') as string
    const email = data.get('email') as string
    const subject = data.get('subject') as string
    const message = data.get('message') as string

    // Validation
    const newErrors: Record<string, string> = {}
    if (!name.trim()) newErrors.name = t('validation.nameRequired')
    if (!email.trim()) newErrors.email = t('validation.emailRequired')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = t('validation.emailInvalid')
    if (!subject.trim()) newErrors.subject = t('validation.subjectRequired')
    if (!message.trim()) newErrors.message = t('validation.messageRequired')
    else if (message.trim().length < 10) newErrors.message = t('validation.messageTooShort')

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})
    setSending(true)
    setStatus('idle')

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      })
      if (!res.ok) throw new Error()
      setStatus('success')
      form.reset()
    } catch {
      setStatus('error')
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="contact-name" className="block text-sm font-medium text-slate-300 mb-1.5">{t('name')}</label>
        <input
          id="contact-name"
          name="name"
          type="text"
          placeholder={t('namePlaceholder')}
          className="w-full input-premium rounded-xl px-4 py-3 text-white placeholder-slate-500"
        />
        {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
      </div>

      <div>
        <label htmlFor="contact-email" className="block text-sm font-medium text-slate-300 mb-1.5">{t('email')}</label>
        <input
          id="contact-email"
          name="email"
          type="email"
          placeholder={t('emailPlaceholder')}
          className="w-full input-premium rounded-xl px-4 py-3 text-white placeholder-slate-500"
        />
        {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
      </div>

      <div>
        <label htmlFor="contact-subject" className="block text-sm font-medium text-slate-300 mb-1.5">{t('subject')}</label>
        <input
          id="contact-subject"
          name="subject"
          type="text"
          placeholder={t('subjectPlaceholder')}
          className="w-full input-premium rounded-xl px-4 py-3 text-white placeholder-slate-500"
        />
        {errors.subject && <p className="text-red-400 text-xs mt-1">{errors.subject}</p>}
      </div>

      <div>
        <label htmlFor="contact-message" className="block text-sm font-medium text-slate-300 mb-1.5">{t('message')}</label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          placeholder={t('messagePlaceholder')}
          className="w-full input-premium rounded-xl px-4 py-3 text-white placeholder-slate-500 resize-none"
        />
        {errors.message && <p className="text-red-400 text-xs mt-1">{errors.message}</p>}
      </div>

      <button
        type="submit"
        disabled={sending}
        className="w-full btn-premium px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
      >
        {sending ? t('sending') : t('submit')}
      </button>

      {status === 'success' && (
        <p className="text-emerald-400 text-sm text-center">{t('success')}</p>
      )}
      {status === 'error' && (
        <p className="text-red-400 text-sm text-center">{t('error')}</p>
      )}
    </form>
  )
}
