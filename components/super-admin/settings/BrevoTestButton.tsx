'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { useToast } from '@/lib/hooks/use-toast'

export function BrevoTestButton() {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleTest = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/test-brevo', { method: 'POST' })
      const data = await res.json()

      if (data.success) {
        toast({
          title: 'Test réussi',
          description: 'Email de test envoyé avec succès.',
        })
      } else {
        toast({
          title: 'Erreur',
          description: data.error || 'Échec du test Brevo',
          variant: 'destructive',
        })
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Erreur de connexion au serveur',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleTest}
      disabled={loading}
      className="border-slate-600 text-slate-300 hover:bg-slate-700"
    >
      {loading ? (
        <Icons.spinner className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <Icons.mail className="h-4 w-4 mr-1" />
          Test
        </>
      )}
    </Button>
  )
}
