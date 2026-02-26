'use client'

import Link from 'next/link'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type LimitType = 'dossiers' | 'clients' | 'ia' | 'ia_monthly'

interface LimitReachedModalProps {
  open: boolean
  onClose: () => void
  type: LimitType
  limit?: number
}

const LIMIT_CONFIG: Record<LimitType, { icon: string; title: string; detail: (limit?: number) => string }> = {
  dossiers: {
    icon: '📁',
    title: "Limite de dossiers atteinte",
    detail: (limit) => `Votre essai gratuit est limité à ${limit ?? 10} dossiers. Passez au plan Pro pour créer des dossiers illimités.`,
  },
  clients: {
    icon: '👥',
    title: "Limite de clients atteinte",
    detail: (limit) => `Votre essai gratuit est limité à ${limit ?? 20} clients. Passez au plan Pro pour gérer des clients illimités.`,
  },
  ia: {
    icon: '✨',
    title: "Requêtes IA épuisées",
    detail: () => `Vous avez utilisé vos 30 requêtes d'essai. Passez au plan Pro pour accéder à 200 requêtes IA par mois.`,
  },
  ia_monthly: {
    icon: '✨',
    title: "Quota mensuel IA atteint",
    detail: () => `Vous avez atteint votre limite mensuelle de requêtes IA. Votre quota se réinitialise le 1er du mois prochain, ou passez au plan Expert pour un accès illimité.`,
  },
}

export function LimitReachedModal({ open, onClose, type, limit }: LimitReachedModalProps) {
  const config = LIMIT_CONFIG[type]

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md bg-slate-900 border border-slate-700 text-white">
        <DialogTitle className="sr-only">{config.title}</DialogTitle>

        <div className="text-center py-2">
          <div className="text-5xl mb-4">{config.icon}</div>

          <div className="inline-flex items-center gap-2 bg-orange-500/15 border border-orange-500/30 text-orange-300 text-xs font-semibold px-3 py-1 rounded-full mb-4">
            Limite d'essai atteinte
          </div>

          <h2 className="text-xl font-bold text-white mb-3">{config.title}</h2>

          <p className="text-slate-300 text-sm leading-relaxed mb-6">
            {config.detail(limit)}
          </p>

          <div className="space-y-3">
            <Button
              asChild
              className="w-full btn-premium text-white font-semibold py-3 rounded-xl"
              onClick={onClose}
            >
              <Link href="/upgrade">
                Passer au plan Pro — 89 DT/mois
              </Link>
            </Button>

            <button
              onClick={onClose}
              className="w-full text-sm text-slate-400 hover:text-slate-200 transition-colors py-2"
            >
              Plus tard
            </button>
          </div>

          <p className="text-xs text-slate-500 mt-4">
            Sans engagement • Annulation à tout moment
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
