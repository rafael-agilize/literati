import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { createAdminClient } from './supabase'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false
      const supabase = createAdminClient()
      // Mirror the user into our own users table for FK references
      const { error } = await supabase.from('users').upsert(
        {
          id: user.id || user.email,
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        },
        { onConflict: 'email' }
      )
      if (error) {
        console.error('[auth] Failed to upsert user:', error.message)
      }
      return true
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
      }
      return session
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id || user.email || token.sub
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
  },
})
