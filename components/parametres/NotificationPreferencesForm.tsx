'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  updateNotificationPreferencesAction,
  testNotificationAction,
  type NotificationPreferences,
} from '@/app/actions/notifications'

interface NotificationPreferencesFormProps {
  preferences: NotificationPreferences
}

export default function NotificationPreferencesForm({
  preferences,
}: NotificationPreferencesFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [formData, setFormData] = useState<NotificationPreferences>(preferences)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    const result = await updateNotificationPreferencesAction(formData)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    setSuccess('✅ Préférences mises à jour avec succès')
    setLoading(false)
    router.refresh()
  }

  const handleTest = async () => {
    setTesting(true)
    setError('')
    setSuccess('')

    const result = await testNotificationAction()

    if (result.error) {
      setError(result.error)
      setTesting(false)
      return
    }

    setSuccess(result.message || '✅ Email de test envoyé !')
    setTesting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Activer/Désactiver notifications */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <h3 className="font-semibold">Activer les notifications quotidiennes</h3>
          <p className="text-sm text-muted-foreground">
            Recevoir un email récapitulatif chaque jour avec vos tâches importantes
          </p>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={formData.enabled}
            onChange={(e) =>
              setFormData({
                ...formData,
                enabled: e.target.checked,
              })
            }
            className="peer sr-only"
          />
          <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300"></div>
        </label>
      </div>

      {formData.enabled && (
        <>
          {/* Heure d'envoi */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Heure d&apos;envoi préférée
            </label>
            <input
              type="time"
              value={formData.send_time}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  send_time: e.target.value,
                })
              }
              min="06:00"
              max="10:00"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Entre 06:00 et 10:00 (fuseau horaire Tunis)
            </p>
          </div>

          {/* Types de notifications - Échéances */}
          <div className="rounded-lg border p-4">
            <h3 className="font-semibold mb-3">Échéances à surveiller</h3>
            <div className="space-y-2">
              {[
                { key: 'j15', label: 'J-15 (15 jours avant)' },
                { key: 'j7', label: 'J-7 (7 jours avant)' },
                { key: 'j3', label: 'J-3 (3 jours avant)' },
                { key: 'j1', label: 'J-1 (veille)' },
              ].map((option) => (
                <label key={option.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={
                      formData.notify_echeances[
                        option.key as keyof typeof formData.notify_echeances
                      ]
                    }
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        notify_echeances: {
                          ...formData.notify_echeances,
                          [option.key]: e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Actions urgentes */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <h3 className="font-semibold">Actions urgentes</h3>
              <p className="text-sm text-muted-foreground">
                Actions avec priorité HAUTE ou URGENTE
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={formData.notify_actions_urgentes}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    notify_actions_urgentes: e.target.checked,
                  })
                }
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300"></div>
            </label>
          </div>

          {/* Audiences */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <h3 className="font-semibold">Audiences de la semaine</h3>
              <p className="text-sm text-muted-foreground">
                Rappel des audiences prévues cette semaine
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={formData.notify_audiences}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    notify_audiences: e.target.checked,
                  })
                }
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300"></div>
            </label>
          </div>

          {/* Factures impayées */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold">Factures impayées</h3>
                <p className="text-sm text-muted-foreground">
                  Rappel des factures non payées après un certain délai
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={formData.notify_factures_impayees}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      notify_factures_impayees: e.target.checked,
                    })
                  }
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300"></div>
              </label>
            </div>
            {formData.notify_factures_impayees && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Seuil d&apos;alerte (jours de retard)
                </label>
                <input
                  type="number"
                  value={formData.factures_seuil_jours}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      factures_seuil_jours: parseInt(e.target.value) || 30,
                    })
                  }
                  min="15"
                  max="90"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">Entre 15 et 90 jours</p>
              </div>
            )}
          </div>

          {/* Langue email */}
          <div>
            <label className="block text-sm font-medium mb-2">Langue de l&apos;email</label>
            <select
              value={formData.langue_email}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  langue_email: e.target.value as 'fr' | 'ar',
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="fr">Français</option>
              <option value="ar">العربية (Arabe)</option>
            </select>
          </div>

          {/* Format email */}
          <div>
            <label className="block text-sm font-medium mb-2">Format de l&apos;email</label>
            <select
              value={formData.format_email}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  format_email: e.target.value as 'html' | 'text',
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="html">HTML (avec images et couleurs)</option>
              <option value="text">Texte brut (simple)</option>
            </select>
          </div>
        </>
      )}

      {/* Messages */}
      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 p-4 text-sm text-green-800">{success}</div>
      )}

      {/* Boutons */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Enregistrement...' : 'Enregistrer'}
        </button>

        {formData.enabled && (
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || loading}
            className="px-6 py-2 border border-blue-600 text-blue-600 rounded-md hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {testing ? 'Envoi...' : '📧 Tester maintenant'}
          </button>
        )}

        <button
          type="button"
          onClick={() => router.back()}
          disabled={loading || testing}
          className="px-6 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          Annuler
        </button>
      </div>

      {/* Info */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h3 className="font-semibold text-blue-900 mb-2">ℹ️ À propos des notifications</h3>
        <ul className="space-y-1 text-sm text-blue-800">
          <li>• Les notifications sont envoyées automatiquement chaque jour à l&apos;heure choisie</li>
          <li>• Seuls les éléments pertinents sont inclus (pas d&apos;email vide)</li>
          <li>
            • Vous pouvez tester immédiatement avec le bouton &quot;Tester maintenant&quot;
          </li>
          <li>• Les logs d&apos;envoi sont conservés 90 jours pour traçabilité</li>
        </ul>
      </div>
    </form>
  )
}
