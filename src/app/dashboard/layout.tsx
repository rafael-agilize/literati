import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { signOut } from '@/lib/auth'
import { BookOpen, LayoutDashboard, LogOut, Plus } from 'lucide-react'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const user = session.user

  return (
    <div className="min-h-screen bg-amber-50/40 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-stone-200 flex flex-col fixed h-full z-10">
        {/* Brand */}
        <div className="px-6 py-5 border-b border-stone-100 flex items-center gap-3">
          <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl p-2 shadow-sm">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-stone-900">Literati</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-stone-700 hover:bg-amber-50 hover:text-amber-800 transition-colors text-sm font-medium"
          >
            <LayoutDashboard className="w-4 h-4" />
            My Characters
          </Link>
          <Link
            href="/dashboard/characters/new"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-stone-700 hover:bg-amber-50 hover:text-amber-800 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New Character
          </Link>
        </nav>

        {/* User footer */}
        <div className="px-4 py-4 border-t border-stone-100">
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt={user.name ?? 'User'}
                className="w-8 h-8 rounded-full flex-shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-amber-200 flex items-center justify-center text-amber-800 font-semibold text-sm flex-shrink-0">
                {(user.name ?? user.email ?? 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-900 truncate">{user.name}</p>
              <p className="text-xs text-stone-400 truncate">{user.email}</p>
            </div>
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/login' })
              }}
            >
              <button
                type="submit"
                title="Sign out"
                className="text-stone-400 hover:text-stone-700 transition-colors p-1 rounded-lg hover:bg-stone-100"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64">
        {children}
      </main>
    </div>
  )
}
