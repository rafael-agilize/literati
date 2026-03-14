import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createAdminClient, resolveUserIdByEmail } from '@/lib/supabase'
import Sidebar from '@/components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user

  const supabase = createAdminClient()
  const userId = user.email ? await resolveUserIdByEmail(supabase, user.email) : null
  const { data: characters } = userId
    ? await supabase
        .from('characters')
        .select('id, name')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(20)
    : { data: [] }
  const charList = (characters ?? []) as { id: string; name: string }[]

  return (
    <div className="min-h-screen bg-amber-50/40 flex">
      <Sidebar user={user} charList={charList} />

      {/* Main content */}
      <main className="flex-1 md:ml-64 pt-16 md:pt-0">
        {children}
      </main>
    </div>
  )
}
