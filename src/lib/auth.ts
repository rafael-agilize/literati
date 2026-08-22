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
          .update({ name: user.name ?? '' })
          .eq('id', existing.id)
        if (error) {
          console.error('[auth] Failed to update user:', error.message)
          return false
        }
      } else {
        // users.id references auth.users(id), so the row must be created
        // through Supabase Auth; the on_auth_user_created trigger then
        // inserts the public.users row with a valid id.
        const { data: created, error } = await supabase.auth.admin.createUser({
          email: user.email,
          email_confirm: true,
          user_metadata: { name: user.name ?? '' },
        })
        let newId = created?.user?.id
        if (error || !newId) {
          // Duplicate-email from a concurrent first sign-in (or an auth user
          // created elsewhere): the trigger row may exist now — re-read it.
          const { data: existingRow } = await supabase
            .from('users')
            .select('id')
            .eq('email', user.email)
            .single()
          newId = existingRow?.id
          if (!newId) {
            console.error('[auth] Failed to create user:', error?.message)
            return false
          }
        }
        // Migrate any existing data that referenced email as user_id
        await supabase
          .from('characters')
          .update({ user_id: newId })
          .eq('user_id', user.email)
        await supabase
          .from('conversations')
          .update({ user_id: newId })
          .eq('user_id', user.email)
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
