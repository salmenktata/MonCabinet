// Edge Function: Notifications Email Quotidiennes
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  try {
    // TODO: Implémenter logique notifications
    // 1. Récupérer utilisateurs avec notifications activées
    // 2. Pour chaque utilisateur, récupérer échéances et actions
    // 3. Envoyer email via Resend
    
    return new Response(
      JSON.stringify({ message: 'Edge Function OK', status: 'ready' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
