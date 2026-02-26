'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type LimitType = 'dossiers' | 'clients' | 'ia' | 'ia_monthly'

interface LimitReachedModalProps {
  open: boolean
  onClose: () => void
  type: LimitType
  limit?: number
}

const LIMIT_ICONS: Record<LimitType, string> = {
  dossiers: '📁',
  clients: '👥',
  ia: '✨',
  ia_monthly: '✨',
}

export function LimitReachedModal({ open, onClose, type, limit }: LimitReachedModalProps) {
  const t = useTranslations('plans')

  const config = {
    dossiers: {
      icon: LIMIT_ICONS.dossiers,
      title: t('limitDossiersTitle'),
      detail: t('limitDossiersDetail', { limit: limit ?? 10 }),
    },
    clients: {
      icon: LIMIT_ICONS.clients,
      title: t('limitClientsTitle'),
      detail: t('limitClientsDetail', { limit: limit ?? 20 }),
    },
    ia: {
      icon: LIMIT_ICONS.ia,
      title: t('limitIATitle'),
      detail: t('limitIADetail'),
    },
    ia_monthly: {
      icon: LIMIT_ICONS.ia_monthly,
      title: t('limitIAMonthlyTitle'),
      detail: t('limitIAMonthlyDetail'),
    },
  }[type]

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md bg-slate-900 border border-slate-700 text-white">
        <DialogTitle className="sr-only">{config.title}</DialogTitle>

        <div className="text-center py-2">
          <div className="text-5xl mb-4">{config.icon}</div>

          <div className="inline-flex items-center gap-2 bg-orange-500/15 border border-orange-500/30 text-orange-300 text-xs font-semibold px-3 py-1 rounded-full mb-4">
            {t('limitReachedBadge')}
          </div>

          <h2 className="text-xl font-bold text-white mb-3">{config.title}</h2>

          <p className="text-slate-300 text-sm leading-relaxed mb-6">
            {config.detail}
          </p>

          <div className="space-y-3">
            <Button
              asChild
              className="w-full btn-premium text-white font-semibold py-3 rounded-xl"
              onClick={onClose}
            >
              <Link href="/upgrade">
                {t('upgradeToPro')}
              </Link>
            </Button>

            <button
              onClick={onClose}
              className="w-full text-sm text-slate-400 hover:text-slate-200 transition-colors py-2"
            >
              {t('later')}
            </button>
          </div>

          <p className="text-xs text-slate-500 mt-4">
            {t('noCommitment')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
