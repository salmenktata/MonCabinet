'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface ApiKeyData {
  provider: string
  label: string
  modelDefault?: string
  tier?: 'free' | 'paid' | 'enterprise'
  rpmLimit?: number
  monthlyQuota?: number
  isActive: boolean
  isPrimary: boolean
}

interface ProviderEditModalProps {
  isOpen: boolean
  onClose: () => void
  apiKey: ApiKeyData | null // null = mode création
  onSaveSuccess: () => void
}

const PROVIDERS = [
  { value: 'gemini', label: '🧠 Gemini' },
  { value: 'deepseek', label: '💜 DeepSeek' },
  { value: 'groq', label: '⚡ Groq' },
  { value: 'anthropic', label: '🧡 Anthropic' },
  { value: 'ollama', label: '🤖 Ollama' },
]

const ProviderEditModal: React.FC<ProviderEditModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  onSaveSuccess,
}) => {
  const isCreating = !apiKey

  const [formData, setFormData] = useState({
    provider: apiKey?.provider || 'gemini',
    label: apiKey?.label || '',
    apiKey: '',
    modelDefault: apiKey?.modelDefault || '',
    tier: apiKey?.tier || 'free',
    rpmLimit: apiKey?.rpmLimit || undefined,
    monthlyQuota: apiKey?.monthlyQuota || undefined,
    isActive: apiKey?.isActive ?? true,
    isPrimary: apiKey?.isPrimary ?? false,
  })

  const [saving, setSaving] = useState(false)

  // Réinitialiser le formulaire quand apiKey change
  useEffect(() => {
    if (apiKey) {
      setFormData({
        provider: apiKey.provider,
        label: apiKey.label,
        apiKey: '', // Ne pas pré-remplir la clé API (sécurité)
        modelDefault: apiKey.modelDefault || '',
        tier: apiKey.tier || 'free',
        rpmLimit: apiKey.rpmLimit,
        monthlyQuota: apiKey.monthlyQuota,
        isActive: apiKey.isActive,
        isPrimary: apiKey.isPrimary,
      })
    } else {
      // Mode création : réinitialiser
      setFormData({
        provider: 'gemini',
        label: '',
        apiKey: '',
        modelDefault: '',
        tier: 'free',
        rpmLimit: undefined,
        monthlyQuota: undefined,
        isActive: true,
        isPrimary: false,
      })
    }
  }, [apiKey])

  const handleSave = async () => {
    // Validation
    if (!formData.label.trim()) {
      toast.error('Le label est requis')
      return
    }

    if (isCreating && !formData.apiKey.trim()) {
      toast.error('La clé API est requise')
      return
    }

    // Si on édite et que la clé API est vide, ne pas l'envoyer (garder l'ancienne)
    const payload: any = {
      label: formData.label.trim(),
      modelDefault: formData.modelDefault.trim() || undefined,
      tier: formData.tier,
      rpmLimit: formData.rpmLimit || undefined,
      monthlyQuota: formData.monthlyQuota || undefined,
      isActive: formData.isActive,
      isPrimary: formData.isPrimary,
    }

    // Envoyer la clé API seulement si renseignée
    if (formData.apiKey.trim()) {
      payload.apiKey = formData.apiKey.trim()
    } else if (isCreating) {
      toast.error('La clé API est requise pour créer un nouveau provider')
      return
    }

    setSaving(true)

    try {
      const response = await fetch(`/api/admin/api-keys/${formData.provider}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (data.success) {
        toast.success(
          isCreating
            ? `Provider ${formData.provider} créé avec succès`
            : `Provider ${formData.provider} mis à jour`
        )
        onSaveSuccess()
      } else {
        toast.error(data.error || 'Erreur lors de la sauvegarde')
      }
    } catch (error) {
      console.error('Error saving API key:', error)
      toast.error(`Erreur réseau: ${error}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isCreating ? 'Ajouter un Provider IA' : `Éditer ${formData.provider}`}
          </DialogTitle>
          <DialogDescription>
            {isCreating
              ? 'Configurer un nouveau provider avec sa clé API'
              : 'Modifier la configuration du provider (laisser la clé API vide pour la conserver)'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Provider (disabled en mode édition) */}
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select
              value={formData.provider}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, provider: value }))
              }
              disabled={!isCreating}
            >
              <SelectTrigger id="provider">
                <SelectValue placeholder="Sélectionner un provider" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Label */}
          <div className="space-y-2">
            <Label htmlFor="label">
              Label <span className="text-destructive">*</span>
            </Label>
            <Input
              id="label"
              value={formData.label}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, label: e.target.value }))
              }
              placeholder="ex: Gemini Production"
            />
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="apiKey">
              Clé API {isCreating && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id="apiKey"
              type="password"
              value={formData.apiKey}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, apiKey: e.target.value }))
              }
              placeholder={
                isCreating
                  ? 'sk-...'
                  : 'Laisser vide pour conserver la clé actuelle'
              }
            />
            {!isCreating && (
              <p className="text-xs text-muted-foreground">
                💡 Pour des raisons de sécurité, la clé actuelle n'est pas affichée. Renseignez ce champ seulement si vous voulez la changer.
              </p>
            )}
          </div>

          {/* Model Default */}
          <div className="space-y-2">
            <Label htmlFor="modelDefault">Modèle par Défaut (optionnel)</Label>
            <Input
              id="modelDefault"
              value={formData.modelDefault}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, modelDefault: e.target.value }))
              }
              placeholder="ex: gemini-1.5-flash, deepseek-chat"
            />
          </div>

          {/* Tier */}
          <div className="space-y-2">
            <Label htmlFor="tier">Tier</Label>
            <Select
              value={formData.tier}
              onValueChange={(value: 'free' | 'paid' | 'enterprise') =>
                setFormData((prev) => ({ ...prev, tier: value }))
              }
            >
              <SelectTrigger id="tier">
                <SelectValue placeholder="Sélectionner un tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free (Gratuit)</SelectItem>
                <SelectItem value="paid">Paid (Payant)</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* RPM Limit */}
          <div className="space-y-2">
            <Label htmlFor="rpmLimit">Limite RPM (requêtes/minute)</Label>
            <Input
              id="rpmLimit"
              type="number"
              value={formData.rpmLimit || ''}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  rpmLimit: e.target.value ? parseInt(e.target.value) : undefined,
                }))
              }
              placeholder="ex: 60"
            />
          </div>

          {/* Monthly Quota */}
          <div className="space-y-2">
            <Label htmlFor="monthlyQuota">Quota Mensuel (requêtes/mois)</Label>
            <Input
              id="monthlyQuota"
              type="number"
              value={formData.monthlyQuota || ''}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  monthlyQuota: e.target.value ? parseInt(e.target.value) : undefined,
                }))
              }
              placeholder="ex: 50000"
            />
          </div>

          {/* Is Active */}
          <div className="flex items-center justify-between space-x-2 p-3 border rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="isActive">Actif</Label>
              <p className="text-xs text-muted-foreground">
                Provider disponible pour les requêtes IA
              </p>
            </div>
            <Switch
              id="isActive"
              checked={formData.isActive}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, isActive: checked }))
              }
            />
          </div>

          {/* Is Primary */}
          <div className="flex items-center justify-between space-x-2 p-3 border rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="isPrimary">Primaire 🏆</Label>
              <p className="text-xs text-muted-foreground">
                Provider utilisé en priorité (ne peut pas être supprimé)
              </p>
            </div>
            <Switch
              id="isPrimary"
              checked={formData.isPrimary}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, isPrimary: checked }))
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enregistrement...
              </>
            ) : (
              'Enregistrer'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ProviderEditModal
