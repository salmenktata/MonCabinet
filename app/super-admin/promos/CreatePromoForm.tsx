'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { createPromoAction } from '@/app/actions/super-admin/promos'

export function CreatePromoForm() {
  const [loading, setLoading] = useState(false)
  const [discountType, setDiscountType] = useState('percent')
  const [appliesTo, setAppliesTo] = useState('all')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    formData.set('discount_type', discountType)
    formData.set('applies_to', appliesTo)

    const result = await createPromoAction(formData)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Code promo créé avec succès')
      ;(e.target as HTMLFormElement).reset()
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
      <div className="space-y-1">
        <Label className="text-slate-400 text-xs">Code *</Label>
        <Input
          name="code"
          placeholder="QADHYA20"
          required
          maxLength={30}
          className="bg-slate-700 border-slate-600 text-white font-mono uppercase"
          onChange={(e) => e.target.value = e.target.value.toUpperCase()}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-slate-400 text-xs">Type remise *</Label>
        <Select value={discountType} onValueChange={setDiscountType}>
          <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="percent">Pourcentage (%)</SelectItem>
            <SelectItem value="fixed">Montant fixe (DT)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-slate-400 text-xs">Valeur *</Label>
        <Input
          name="discount_value"
          type="number"
          min={1}
          max={discountType === 'percent' ? 100 : 10000}
          required
          placeholder={discountType === 'percent' ? '20' : '30'}
          className="bg-slate-700 border-slate-600 text-white"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-slate-400 text-xs">Applicable à</Label>
        <Select value={appliesTo} onValueChange={setAppliesTo}>
          <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les plans</SelectItem>
            <SelectItem value="pro">Pro uniquement</SelectItem>
            <SelectItem value="expert">Expert uniquement</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-slate-400 text-xs">Max utilisations</Label>
        <Input
          name="max_uses"
          type="number"
          min={1}
          placeholder="Illimité"
          className="bg-slate-700 border-slate-600 text-white"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-slate-400 text-xs">Expire le</Label>
        <Input
          name="expires_at"
          type="date"
          min={new Date().toISOString().split('T')[0]}
          className="bg-slate-700 border-slate-600 text-white"
        />
      </div>

      <div className="col-span-2 md:col-span-3 lg:col-span-6">
        <Button type="submit" disabled={loading} className="w-full md:w-auto">
          {loading ? 'Création...' : 'Créer le code promo'}
        </Button>
      </div>
    </form>
  )
}
