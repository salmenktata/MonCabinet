'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icons } from '@/lib/icons'
import Link from 'next/link'

export default function AccesAnticipatPage() {
  const [form, setForm] = useState({ nom: '', prenom: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'acces-anticipe' }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Une erreur est survenue. Veuillez réessayer.')
      } else {
        setSubmitted(true)
      }
    } catch {
      setError('Impossible de se connecter. Vérifiez votre connexion.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto">
          <Icons.checkCircle className="h-8 w-8 text-green-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Votre place est réservée !</h2>
        <p className="text-slate-400 text-sm">
          Nous vous enverrons un email dès que votre invitation est prête.
          En général sous 24-48h.
        </p>
        <div className="bg-slate-700/50 rounded-lg p-4 text-left text-sm text-slate-300 space-y-2">
          <p className="font-medium text-white">Ce qui vous attend :</p>
          <div className="flex items-center gap-2">
            <Icons.sparkles className="h-4 w-4 text-amber-400 shrink-0" />
            <span>30 questions à l'assistant juridique IA</span>
          </div>
          <div className="flex items-center gap-2">
            <Icons.scale className="h-4 w-4 text-blue-400 shrink-0" />
            <span>+6 800 textes juridiques tunisiens indexés</span>
          </div>
          <div className="flex items-center gap-2">
            <Icons.fileText className="h-4 w-4 text-green-400 shrink-0" />
            <span>Templates de documents FR/AR prêts à l'emploi</span>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Vous avez déjà un compte ?{' '}
          <Link href="/login" className="text-blue-400 hover:text-blue-300">
            Se connecter
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1 text-xs text-amber-400 font-medium mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Accès anticipé — Places limitées
        </div>
        <h1 className="text-2xl font-bold text-white">
          Rejoignez Qadhya en avant-première
        </h1>
        <p className="text-slate-400 text-sm">
          La plateforme de gestion de cabinet juridique pensée pour les avocats tunisiens.
        </p>
      </div>

      {/* Formulaire */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="prenom" className="text-slate-300 text-sm">Prénom</Label>
            <Input
              id="prenom"
              placeholder="Ahmed"
              value={form.prenom}
              onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
              required
              className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nom" className="text-slate-300 text-sm">Nom</Label>
            <Input
              id="nom"
              placeholder="Ben Ali"
              value={form.nom}
              onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
              required
              className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-slate-300 text-sm">Email professionnel</Label>
          <Input
            id="email"
            type="email"
            placeholder="avocat@cabinet.tn"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            required
            className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 rounded-lg p-3">
            <Icons.alertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        >
          {loading ? (
            <Icons.loader className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Icons.mail className="h-4 w-4 mr-2" />
          )}
          Réserver ma place gratuitement
        </Button>
      </form>

      {/* Points clés */}
      <div className="grid grid-cols-3 gap-3 text-center text-xs text-slate-400">
        <div className="flex flex-col items-center gap-1">
          <Icons.checkCircle className="h-4 w-4 text-green-400" />
          <span>Gratuit</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Icons.lock className="h-4 w-4 text-blue-400" />
          <span>Sans CB</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Icons.zap className="h-4 w-4 text-amber-400" />
          <span>Accès rapide</span>
        </div>
      </div>

      <p className="text-center text-xs text-slate-500">
        Vous avez déjà un compte ?{' '}
        <Link href="/login" className="text-blue-400 hover:text-blue-300">
          Se connecter
        </Link>
      </p>
    </div>
  )
}
