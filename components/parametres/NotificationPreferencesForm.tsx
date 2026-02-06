'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Loader2, Save } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { saveNotificationPreferencesAction, type NotificationPreferences } from '@/app/actions/cabinet'

interface NotificationPreferencesDB extends NotificationPreferences {
  id: string
  user_id: string
  created_at?: string
  updated_at?: string
}

interface Props {
  preferences: NotificationPreferencesDB | null
  userId: string
}

export default function NotificationPreferencesForm({ preferences, userId }: Props) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    enabled: preferences?.enabled ?? true,
    daily_digest_enabled: preferences?.daily_digest_enabled ?? true,
    daily_digest_time: preferences?.daily_digest_time ?? '06:00:00',
    alerte_j15_enabled: preferences?.alerte_j15_enabled ?? true,
    alerte_j7_enabled: preferences?.alerte_j7_enabled ?? true,
    alerte_j3_enabled: preferences?.alerte_j3_enabled ?? true,
    alerte_j1_enabled: preferences?.alerte_j1_enabled ?? true,
    alerte_actions_urgentes: preferences?.alerte_actions_urgentes ?? true,
    alerte_actions_priorite_haute: preferences?.alerte_actions_priorite_haute ?? true,
    alerte_audiences_semaine: preferences?.alerte_audiences_semaine ?? true,
    alerte_audiences_veille: preferences?.alerte_audiences_veille ?? true,
    alerte_factures_impayees: preferences?.alerte_factures_impayees ?? true,
    alerte_factures_impayees_delai_jours: preferences?.alerte_factures_impayees_delai_jours ?? 30,
    alerte_delais_appel: preferences?.alerte_delais_appel ?? true,
    alerte_delais_cassation: preferences?.alerte_delais_cassation ?? true,
    alerte_delais_opposition: preferences?.alerte_delais_opposition ?? true,
    email_format: preferences?.email_format ?? 'html',
    langue_email: preferences?.langue_email ?? 'fr',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await saveNotificationPreferencesAction(formData)

      if (result.error) {
        throw new Error(result.error)
      }

      toast({
        title: 'Préférences enregistrées',
        description: 'Vos préférences de notifications ont été mises à jour.',
      })

      router.refresh()
    } catch (error: any) {
      console.error('Erreur sauvegarde préférences:', error)
      toast({
        title: 'Erreur',
        description: error.message || 'Impossible de sauvegarder les préférences.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Activer/Désactiver toutes les notifications */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="enabled" className="text-base font-semibold">
            Activer les notifications
          </Label>
          <p className="text-sm text-muted-foreground">
            Activer ou désactiver toutes les notifications email
          </p>
        </div>
        <Switch
          id="enabled"
          checked={formData.enabled}
          onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
        />
      </div>

      <Separator />

      {/* Email quotidien */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Email quotidien</h3>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="daily_digest_enabled">Récapitulatif quotidien</Label>
            <p className="text-sm text-muted-foreground">
              Email avec échéances, actions urgentes et audiences du jour
            </p>
          </div>
          <Switch
            id="daily_digest_enabled"
            checked={formData.daily_digest_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, daily_digest_enabled: checked })}
            disabled={!formData.enabled}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="daily_digest_time">Heure d'envoi</Label>
          <Input
            type="time"
            id="daily_digest_time"
            value={formData.daily_digest_time}
            onChange={(e) => setFormData({ ...formData, daily_digest_time: e.target.value })}
            disabled={!formData.enabled || !formData.daily_digest_enabled}
            className="max-w-[200px]"
          />
        </div>
      </div>

      <Separator />

      {/* Alertes échéances */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Alertes échéances</h3>

        <div className="flex items-center justify-between">
          <Label htmlFor="alerte_j15_enabled">15 jours avant</Label>
          <Switch
            id="alerte_j15_enabled"
            checked={formData.alerte_j15_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, alerte_j15_enabled: checked })}
            disabled={!formData.enabled}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="alerte_j7_enabled">7 jours avant</Label>
          <Switch
            id="alerte_j7_enabled"
            checked={formData.alerte_j7_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, alerte_j7_enabled: checked })}
            disabled={!formData.enabled}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="alerte_j3_enabled">3 jours avant</Label>
          <Switch
            id="alerte_j3_enabled"
            checked={formData.alerte_j3_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, alerte_j3_enabled: checked })}
            disabled={!formData.enabled}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="alerte_j1_enabled">La veille (J-1)</Label>
          <Switch
            id="alerte_j1_enabled"
            checked={formData.alerte_j1_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, alerte_j1_enabled: checked })}
            disabled={!formData.enabled}
          />
        </div>
      </div>

      <Separator />

      {/* Alertes actions */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Alertes actions</h3>

        <div className="flex items-center justify-between">
          <Label htmlFor="alerte_actions_urgentes">Actions priorité URGENTE</Label>
          <Switch
            id="alerte_actions_urgentes"
            checked={formData.alerte_actions_urgentes}
            onCheckedChange={(checked) => setFormData({ ...formData, alerte_actions_urgentes: checked })}
            disabled={!formData.enabled}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="alerte_actions_priorite_haute">Actions priorité HAUTE</Label>
          <Switch
            id="alerte_actions_priorite_haute"
            checked={formData.alerte_actions_priorite_haute}
            onCheckedChange={(checked) => setFormData({ ...formData, alerte_actions_priorite_haute: checked })}
            disabled={!formData.enabled}
          />
        </div>
      </div>

      <Separator />

      {/* Alertes audiences */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Alertes audiences</h3>

        <div className="flex items-center justify-between">
          <Label htmlFor="alerte_audiences_semaine">Audiences de la semaine</Label>
          <Switch
            id="alerte_audiences_semaine"
            checked={formData.alerte_audiences_semaine}
            onCheckedChange={(checked) => setFormData({ ...formData, alerte_audiences_semaine: checked })}
            disabled={!formData.enabled}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="alerte_audiences_veille">Rappel veille audience</Label>
          <Switch
            id="alerte_audiences_veille"
            checked={formData.alerte_audiences_veille}
            onCheckedChange={(checked) => setFormData({ ...formData, alerte_audiences_veille: checked })}
            disabled={!formData.enabled}
          />
        </div>
      </div>

      <Separator />

      {/* Alertes factures */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Alertes factures</h3>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="alerte_factures_impayees">Factures impayées</Label>
            <p className="text-sm text-muted-foreground">
              Alerte si facture impayée au-delà du délai défini
            </p>
          </div>
          <Switch
            id="alerte_factures_impayees"
            checked={formData.alerte_factures_impayees}
            onCheckedChange={(checked) => setFormData({ ...formData, alerte_factures_impayees: checked })}
            disabled={!formData.enabled}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="alerte_factures_impayees_delai_jours">Délai (jours)</Label>
          <Input
            type="number"
            id="alerte_factures_impayees_delai_jours"
            value={formData.alerte_factures_impayees_delai_jours}
            onChange={(e) =>
              setFormData({
                ...formData,
                alerte_factures_impayees_delai_jours: parseInt(e.target.value) || 30,
              })
            }
            disabled={!formData.enabled || !formData.alerte_factures_impayees}
            min={1}
            className="max-w-[200px]"
          />
          <p className="text-xs text-muted-foreground">
            Nombre de jours avant d'être alerté (défaut: 30 jours)
          </p>
        </div>
      </div>

      <Separator />

      {/* Alertes délais légaux */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Alertes délais légaux</h3>

        <div className="flex items-center justify-between">
          <Label htmlFor="alerte_delais_appel">Délai d'appel (20j civil / 10j commercial)</Label>
          <Switch
            id="alerte_delais_appel"
            checked={formData.alerte_delais_appel}
            onCheckedChange={(checked) => setFormData({ ...formData, alerte_delais_appel: checked })}
            disabled={!formData.enabled}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="alerte_delais_cassation">Délai de cassation (60j)</Label>
          <Switch
            id="alerte_delais_cassation"
            checked={formData.alerte_delais_cassation}
            onCheckedChange={(checked) => setFormData({ ...formData, alerte_delais_cassation: checked })}
            disabled={!formData.enabled}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="alerte_delais_opposition">Délai d'opposition (10j)</Label>
          <Switch
            id="alerte_delais_opposition"
            checked={formData.alerte_delais_opposition}
            onCheckedChange={(checked) => setFormData({ ...formData, alerte_delais_opposition: checked })}
            disabled={!formData.enabled}
          />
        </div>
      </div>

      <Separator />

      {/* Format email */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Préférences email</h3>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="email_format">Format email</Label>
            <Select
              value={formData.email_format}
              onValueChange={(value) => setFormData({ ...formData, email_format: value as 'html' | 'text' })}
              disabled={!formData.enabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="html">HTML (enrichi)</SelectItem>
                <SelectItem value="text">Texte brut</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="langue_email">Langue</Label>
            <Select
              value={formData.langue_email}
              onValueChange={(value) => setFormData({ ...formData, langue_email: value as 'fr' | 'ar' })}
              disabled={!formData.enabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="ar">العربية</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Bouton sauvegarder */}
      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sauvegarde...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Sauvegarder les préférences
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
