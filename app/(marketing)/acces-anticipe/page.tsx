'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'

export default function AccesAnticipePage() {
  const [formData, setFormData] = useState({ nom: '', prenom: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, source: 'acces-anticipe' }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Une erreur est survenue')
        return
      }

      setSubmitted(true)
      toast.success('Votre place est réservée !')
    } catch {
      toast.error('Une erreur est survenue, réessayez.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md mx-auto text-center glass-card rounded-2xl p-10">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-white mb-3">Votre place est réservée !</h2>
          <p className="text-slate-300 mb-6">
            Vous faites partie des premiers avocats à découvrir Qadhya.
            Votre invitation arrivera dans les prochains jours.
          </p>
          <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-xl p-4 text-left mb-6">
            <p className="text-emerald-300 font-semibold text-sm mb-2">Ce qui vous attend :</p>
            <ul className="text-emerald-200 text-sm space-y-1">
              {[
                'Accès gratuit complet, sans CB',
                '30 requêtes IA juridique incluses',
                '+6 800 documents de droit tunisien',
                'Structuration automatique des dossiers',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <Link href="/" className="text-slate-400 text-sm hover:text-white transition-colors">
            Retour à l'accueil
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-20">
      <div className="max-w-xl mx-auto w-full">
        {/* Badge */}
        <div className="text-center mb-8">
          <span className="inline-block bg-blue-500/20 text-blue-400 text-xs font-bold px-3 py-1 rounded-full mb-4 border border-blue-500/30">
            Accès Anticipé — 100 places disponibles
          </span>
          <h1 className="text-4xl font-bold text-white mb-4 leading-tight">
            Soyez parmi les premiers<br />
            <span className="text-gradient">avocats à utiliser Qadhya</span>
          </h1>
          <p className="text-slate-300 text-lg">
            Inscrivez-vous maintenant pour recevoir votre invitation en priorité.
            Accès gratuit complet inclus, sans carte bancaire.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { value: '+6 800', label: 'documents juridiques' },
            { value: '30', label: 'req. IA offertes' },
            { value: '∞', label: 'accès gratuit' },
          ].map((stat, i) => (
            <div key={i} className="glass-card rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-slate-400 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Formulaire */}
        <div className="glass-card rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Nom *</label>
                <input
                  type="text"
                  required
                  value={formData.nom}
                  onChange={e => setFormData(p => ({ ...p, nom: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Ben Ali"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Prénom *</label>
                <input
                  type="text"
                  required
                  value={formData.prenom}
                  onChange={e => setFormData(p => ({ ...p, prenom: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Sami"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email professionnel *</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                placeholder="avocat@cabinet.tn"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-premium w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Réservation en cours...</span>
                </>
              ) : (
                'Réserver ma place gratuite'
              )}
            </button>
          </form>

          <p className="text-xs text-slate-500 text-center mt-4">
            Sans carte bancaire • Pas de spam • Désabonnement en 1 clic
          </p>
        </div>

        {/* Témoignages / Social proof placeholder */}
        <div className="mt-8 text-center">
          <p className="text-slate-400 text-sm">
            Déjà <span className="text-white font-semibold">47 avocats</span> inscrits sur la liste d'attente
          </p>
        </div>
      </div>
    </div>
  )
}
