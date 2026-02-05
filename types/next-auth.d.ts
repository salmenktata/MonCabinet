/**
 * Déclarations de types TypeScript pour NextAuth
 * Étend les types par défaut pour inclure l'ID utilisateur
 */

import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  /**
   * Interface Session étendue avec ID utilisateur
   */
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
    }
  }

  /**
   * Interface User étendue
   */
  interface User {
    id: string
    email: string
    name?: string
  }
}

declare module 'next-auth/jwt' {
  /**
   * Interface JWT étendue avec ID utilisateur
   */
  interface JWT {
    id: string
    email: string
  }
}
