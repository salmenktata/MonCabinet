/**
 * Modal d'ajout rapide de contact depuis une consultation
 * Permet d'enregistrer les experts, témoins, notaires mentionnés
 *
 * @module components/dossiers/consultation/modals
 * @see Phase 4.3 - TODOs Critiques - Modals Consultation
 */

'use client'

import { useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UserPlus, Loader2, CheckCircle2 } from 'lucide-react'
import { useToastNotifications } from '@/components/feedback'
import { createContact } from '@/app/actions/contacts'

interface AddContactModalProps {
  /**
   * État d'ouverture du modal
   */
  open: boolean

  /**
   * Callback de fermeture
   */
  onClose: () => void

  /**
   * Suggestions de contacts extraits de la consultation
   */
  suggestions?: string[]

  /**
   * Callback après ajout réussi
   */
  onContactAdded?: () => void
}

/**
 * Types de contact disponibles
 */
const CONTACT_TYPES = [
  { value: 'expert', label: 'Expert' },
  { value: 'temoin', label: 'Témoin' },
  { value: 'notaire', label: 'Notaire' },
  { value: 'huissier', label: 'Huissier' },
  { value: 'autre', label: 'Autre' },
] as const

/**
 * Modal d'ajout de contact
 */
export function AddContactModal({
  open,
  onClose,
  suggestions = [],
  onContactAdded,
}: AddContactModalProps) {
  const toast = useToastNotifications()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    nom: '',
    prenom: '',
    type: 'expert' as typeof CONTACT_TYPES[number]['value'],
    email: '',
    telephone: '',
    specialite: '',
    notes: suggestions.length > 0 ? `Mentionné dans consultation:\n${suggestions.join('\n')}` : '',
  })

  /**
   * Handle form change
   */
  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  /**
   * Handle form submit
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validation basique
    if (!formData.nom.trim()) {
      toast.error('Erreur', 'Le nom est requis')
      return
    }

    setIsSubmitting(true)

    try {
      // Appel API pour créer le contact
      await createContact({
        nom: formData.nom.trim(),
        prenom: formData.prenom.trim(),
        type: formData.type,
        email: formData.email.trim() || undefined,
        telephone: formData.telephone.trim() || undefined,
        specialite: formData.specialite.trim() || undefined,
        notes: formData.notes.trim() || undefined,
      })

      setIsSuccess(true)
      toast.success('Contact ajouté', `${formData.prenom} ${formData.nom} a été ajouté avec succès`)

      // Callback
      onContactAdded?.()

      // Fermer après 1.5s
      setTimeout(() => {
        handleClose()
      }, 1500)
    } catch (error) {
      console.error('Failed to create contact:', error)
      toast.error('Erreur', 'Impossible d\'ajouter le contact')
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * Reset et fermer
   */
  const handleClose = () => {
    setFormData({
      nom: '',
      prenom: '',
      type: 'expert',
      email: '',
      telephone: '',
      specialite: '',
      notes: suggestions.length > 0 ? `Mentionné dans consultation:\n${suggestions.join('\n')}` : '',
    })
    setIsSuccess(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isSuccess ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Contact ajouté
              </>
            ) : (
              <>
                <UserPlus className="h-5 w-5 text-blue-600" />
                Ajouter un contact
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isSuccess
              ? 'Le contact a été enregistré avec succès'
              : 'Enregistrer un expert, témoin ou autre contact mentionné dans la consultation'}
          </DialogDescription>
        </DialogHeader>

        {isSuccess ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-16 w-16 text-green-600" />
              <p className="mt-4 text-sm text-muted-foreground">
                Fermeture automatique...
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type de contact */}
            <div className="space-y-2">
              <Label htmlFor="type">Type de contact *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => handleChange('type', value)}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Nom et Prénom */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nom">Nom *</Label>
                <Input
                  id="nom"
                  value={formData.nom}
                  onChange={(e) => handleChange('nom', e.target.value)}
                  placeholder="Nom"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prenom">Prénom</Label>
                <Input
                  id="prenom"
                  value={formData.prenom}
                  onChange={(e) => handleChange('prenom', e.target.value)}
                  placeholder="Prénom"
                />
              </div>
            </div>

            {/* Email et Téléphone */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telephone">Téléphone</Label>
                <Input
                  id="telephone"
                  type="tel"
                  value={formData.telephone}
                  onChange={(e) => handleChange('telephone', e.target.value)}
                  placeholder="+216 XX XXX XXX"
                />
              </div>
            </div>

            {/* Spécialité */}
            <div className="space-y-2">
              <Label htmlFor="specialite">Spécialité</Label>
              <Input
                id="specialite"
                value={formData.specialite}
                onChange={(e) => handleChange('specialite', e.target.value)}
                placeholder="Ex: Expert comptable, Médecin légiste..."
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Notes additionnelles..."
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Ajout...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Ajouter
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
