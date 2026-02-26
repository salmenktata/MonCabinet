import { query } from '@/lib/db/postgres'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PromoAdminActions } from './PromoAdminActions'
import { CreatePromoForm } from './CreatePromoForm'

async function getPromos() {
  const result = await query(
    `SELECT
       p.id, p.code, p.discount_type, p.discount_value, p.applies_to,
       p.max_uses, p.used_count, p.expires_at, p.is_active, p.created_at,
       u.email AS created_by_email
     FROM promo_codes p
     LEFT JOIN users u ON u.id = p.created_by
     ORDER BY p.created_at DESC`,
    []
  )
  return result.rows
}

export default async function PromosPage() {
  const promos = await getPromos()

  const activeCount = promos.filter(p => p.is_active).length
  const totalUses = promos.reduce((acc, p) => acc + parseInt(p.used_count || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Codes Promo</h2>
          <p className="text-slate-400">Gérer les codes promotionnels</p>
        </div>
        <div className="flex gap-4 text-sm text-slate-400">
          <span>{activeCount} actif{activeCount > 1 ? 's' : ''}</span>
          <span>{totalUses} utilisation{totalUses > 1 ? 's' : ''} total</span>
        </div>
      </div>

      {/* Formulaire de création */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-base">Créer un code promo</CardTitle>
          <CardDescription className="text-slate-400">
            Les codes sont automatiquement mis en majuscules
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreatePromoForm />
        </CardContent>
      </Card>

      {/* Liste des codes */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white text-base">Codes existants ({promos.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {promos.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">Aucun code promo créé</p>
          ) : (
            <div className="space-y-2">
              {promos.map((promo) => {
                const isExpired = promo.expires_at && new Date(promo.expires_at) < new Date()
                const isExhausted = promo.max_uses !== null && promo.used_count >= promo.max_uses

                return (
                  <div
                    key={promo.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      !promo.is_active || isExpired || isExhausted
                        ? 'bg-slate-700/30 border-slate-700 opacity-60'
                        : 'bg-slate-700/50 border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <code className="text-white font-mono font-bold text-sm">{promo.code}</code>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={
                          promo.discount_type === 'percent'
                            ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                            : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        }>
                          {promo.discount_type === 'percent'
                            ? `-${promo.discount_value}%`
                            : `-${promo.discount_value} DT`}
                        </Badge>

                        {promo.applies_to !== 'all' && (
                          <Badge variant="outline" className="text-slate-300 border-slate-500 text-xs">
                            {promo.applies_to === 'pro' ? 'Pro uniquement' : 'Expert uniquement'}
                          </Badge>
                        )}

                        {isExpired && (
                          <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Expiré</Badge>
                        )}
                        {isExhausted && (
                          <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">Épuisé</Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-right">
                      <div className="text-xs text-slate-400">
                        <p>{promo.used_count}{promo.max_uses !== null ? `/${promo.max_uses}` : ''} utilisations</p>
                        {promo.expires_at && (
                          <p>Expire le {new Date(promo.expires_at).toLocaleDateString('fr-FR')}</p>
                        )}
                      </div>

                      <PromoAdminActions
                        promoId={promo.id}
                        isActive={promo.is_active}
                        usedCount={parseInt(promo.used_count || 0)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
