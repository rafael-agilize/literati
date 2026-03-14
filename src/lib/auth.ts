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

      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('email', user.email)
        .single()

      if (existing) {
        const { error } = await supabase
          .from('users')
          .update({ name: user.name ?? null, image: user.image ?? null })
          .eq('id', existing.id)
        if (error) {
          console.error('[auth] Failed to update user:', error.message)
          return false
        }
      } else {
        const { error } = await supabase.from('users').insert({
          id: user.email,
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        })
        if (error) {
          console.error('[auth] Failed to create user:', error.message)
          return false
        }
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
      if (user?.email) {
        const supabase = createAdminClient()
        const { data } = await supabase
          .from('users')
          .select('id')
          .eq('email', user.email)
          .single()
        token.sub = data?.id ?? user.email
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
  },
})
