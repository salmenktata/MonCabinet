'use client'

import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { useFetchAction } from '@/hooks/super-admin/useFetchAction'

export function BrevoTestButton() {
  const { trigger, loading } = useFetchAction('/api/admin/test-brevo', {
    method: 'POST',
    successMessage: 'Test réussi — Email de test envoyé avec succès.',
    errorMessage: 'Échec du test Brevo',
  })

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => trigger()}
      disabled={loading}
      className="border-border text-muted-foreground hover:bg-muted"
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
