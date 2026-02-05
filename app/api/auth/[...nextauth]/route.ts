/**
 * Configuration NextAuth pour MonCabinet
 * Remplace Supabase Auth par NextAuth.js avec authentification par credentials.
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
          const result = await query(
            'SELECT id, email, password_hash, nom, prenom FROM users WHERE email = $1',
            [credentials.email]
          )

          const user = result.rows[0]
          if (!user) {
            throw new Error('Email ou mot de passe incorrect')
          }

          const isPasswordValid = await compare(credentials.password, user.password_hash)
          if (!isPasswordValid) {
            throw new Error('Email ou mot de passe incorrect')
          }

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
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: '/login',
    signOut: '/logout',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
      }
      return session
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`
      else if (new URL(url).origin === baseUrl) return url
      return baseUrl + '/dashboard'
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
