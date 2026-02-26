'use client'

import { useState } from 'react'
import { getErrorMessage } from '@/lib/utils/error-utils'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'
import { Separator } from '@/components/ui/separator'
import { updateProfileAction, changePasswordAction, updateEmailAction } from '@/app/actions/profile'

interface ProfileFormProps {
  profile: {
    id: string
    nom?: string
    prenom?: string
  } | null
  userEmail: string
}

export default function ProfileForm({ profile, userEmail }: ProfileFormProps) {
  const router = useRouter()
  const t = useTranslations('profile')

  const [isLoading, setIsLoading] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const [formData, setFormData] = useState({
    prenom: profile?.prenom || '',
    nom: profile?.nom || '',
    email: userEmail,
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Mettre à jour le profil (nom, prénom)
      const profileResult = await updateProfileAction({
        nom: formData.nom,
        prenom: formData.prenom,
      })

      if (profileResult.error) {
        throw new Error(profileResult.error)
      }

      // Mettre à jour l'email si modifié
      if (formData.email !== userEmail) {
        const emailResult = await updateEmailAction(formData.email)

        if (emailResult.error) {
          throw new Error(emailResult.error)
        }

        toast.success(`${t('emailUpdated')} \u2014 ${emailResult.message || 'Veuillez vous reconnecter avec votre nouvelle adresse email.'}`)
      }

      toast.success(t('profileUpdated'))

      router.refresh()
    } catch (error) {
      console.error('Erreur mise à jour profil:', error)
      toast.error(getErrorMessage(error) || t('updateError'))
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()

    if (formData.newPassword !== formData.confirmPassword) {
      toast.error(t('passwordMismatch'))
      return
    }

    if (formData.newPassword.length < 6) {
      toast.error(t('passwordTooShort'))
      return
    }

    setIsChangingPassword(true)

    try {
      const result = await changePasswordAction({
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword,
      })

      if (result.error) {
        throw new Error(result.error)
      }

      toast.success(t('passwordChanged'))

      // Réinitialiser les champs
      setFormData({
        ...formData,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
    } catch (error) {
      console.error('Erreur changement mot de passe:', error)
      toast.error(getErrorMessage(error) || t('changePasswordError'))
    } finally {
      setIsChangingPassword(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Informations personnelles */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-4">{t('personalInfo')}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prenom">{t('firstNameLabel')}</Label>
              <Input
                id="prenom"
                value={formData.prenom}
                onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
                placeholder="Mohamed"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nom">{t('lastNameLabel')}</Label>
              <Input
                id="nom"
                value={formData.nom}
                onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                placeholder="Ben Ahmed"
              />
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <Label htmlFor="email">{t('emailLabel')}</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="email@exemple.tn"
            />
            {formData.email !== userEmail && (
              <p className="text-sm text-yellow-600">
                {t('emailChangeWarning')}
              </p>
            )}
          </div>
        </div>

        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
              {t('saving')}
            </>
          ) : (
            <>
              <Icons.save className="mr-2 h-4 w-4" />
              {t('save')}
            </>
          )}
        </Button>
      </form>

      <Separator />

      {/* Changement de mot de passe */}
      <form onSubmit={handlePasswordChange} className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-4">{t('changePassword')}</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t('newPassword')}</Label>
              <Input
                id="newPassword"
                type="password"
                value={formData.newPassword}
                onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                placeholder={t('passwordMinChars')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('confirmPasswordLabel')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder={t('passwordRetype')}
              />
            </div>
          </div>
        </div>

        <Button
          type="submit"
          variant="outline"
          disabled={isChangingPassword || !formData.newPassword || !formData.confirmPassword}
        >
          {isChangingPassword ? (
            <>
              <Icons.loader className="mr-2 h-4 w-4 animate-spin" />
              {t('changing')}
            </>
          ) : (
            <>
              <Icons.key className="mr-2 h-4 w-4" />
              {t('changePasswordBtn')}
            </>
          )}
        </Button>
      </form>
    </div>
  )
}
