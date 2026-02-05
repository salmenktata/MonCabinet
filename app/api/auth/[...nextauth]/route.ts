/**
 * Configuration NextAuth pour MonCabinet
 *
 * Remplace Supabase Auth par NextAuth.js avec authentification par credentials.
 * Utilise PostgreSQL direct pour la vérification des utilisateurs.
 */

import NextAuth, { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { query } from '@/lib/db/postgres'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'votre@email.com' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email et mot de passe requis')
        }

        try {
          // Récupérer l'utilisateur depuis PostgreSQL
          const result = await query(
            'SELECT id, email, password_hash, nom, prenom FROM users WHERE email = $1',
            [credentials.email]
          )

          const user = result.rows[0]

          if (!user) {
            throw new Error('Email ou mot de passe incorrect')
          }

          // Vérifier le mot de passe avec bcrypt
          const isPasswordValid = await compare(credentials.password, user.password_hash)

          if (!isPasswordValid) {
            throw new Error('Email ou mot de passe incorrect')
          }

          // Retourner les informations utilisateur pour la session
          return {
            id: user.id,
            email: user.email,
            name: user.nom && user.prenom ? `${user.prenom} ${user.nom}` : user.email,
          }
        } catch (error) {
          console.error('Erreur authentification:', error)
          throw error
        }
      },
    }),
  ],

  // Configuration de la session
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 jours
  },

  // Pages personnalisées
  pages: {
    signIn: '/login',
    signOut: '/logout',
    error: '/login', // Rediriger les erreurs vers login
  },

  // Callbacks pour personnaliser les tokens et sessions
  callbacks: {
    async jwt({ token, user }) {
      // Lors de la connexion, ajouter l'ID utilisateur au token
      if (user) {
        token.id = user.id
        token.email = user.email
      }
      return token
    },

    async session({ session, token }) {
      // Ajouter l'ID utilisateur à la session
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
      }
      return session
    },

    async redirect({ url, baseUrl }) {
      // Redirection après connexion
      if (url.startsWith('/')) return `${baseUrl}${url}`
      else if (new URL(url).origin === baseUrl) return url
      return baseUrl + '/dashboard'
    },
  },

  // Secret pour signer les tokens JWT
  secret: process.env.NEXTAUTH_SECRET,

  // Configuration debug (désactiver en production)
  debug: process.env.NODE_ENV === 'development',
}

const handler = NextAuth(authOptions)

// Export pour Next.js App Router
export { handler as GET, handler as POST }
