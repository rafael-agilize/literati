'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { BookOpen, LayoutDashboard, LogOut, MessageSquarePlus, Plus, Menu, X } from 'lucide-react'
import { signOutAction } from '@/lib/actions'

type User = {
  name?: string | null
  email?: string | null
  image?: string | null
}

type CharItem = {
  id: string
  name: string
}

export default function Sidebar({ user, charList }: { user: User; charList: CharItem[] }) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  // Close drawer on route change
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl p-2 shadow-sm">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-stone-900">Literati</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="md:hidden p-2 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto no-scrollbar">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-stone-700 hover:bg-amber-50 hover:text-amber-800 transition-colors text-sm font-medium min-h-[44px]"
        >
          <LayoutDashboard className="w-4 h-4" />
          My Characters
        </Link>
        <Link
          href="/dashboard/characters/new"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-stone-700 hover:bg-amber-50 hover:text-amber-800 transition-colors text-sm font-medium min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          New Character
        </Link>

        {/* Character list */}
        {charList.length > 0 && (
          <div className="pt-4 mt-4 border-t border-stone-100 space-y-1">
            <p className="px-3 text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2">
              Characters
            </p>
            {charList.map((char) => (
              <div key={char.id} className="flex items-center group">
                <Link
                  href={`/dashboard/characters/${char.id}`}
                  className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2 rounded-xl text-stone-600 hover:bg-amber-50 hover:text-amber-800 transition-colors text-sm min-h-[44px]"
                >
                  <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {char.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{char.name}</span>
                </Link>
                <Link
                  href={`/dashboard/chat/${char.id}/new`}
                  title={`New chat with ${char.name}`}
                  className="mr-2 p-1.5 rounded-lg text-stone-300 hover:text-amber-600 hover:bg-amber-50 transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100 flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <MessageSquarePlus className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-stone-100" style={{ paddingBottom: 'max(1rem, var(--safe-area-bottom))' }}>
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
          <form action={signOutAction}>
            <button
              type="submit"
              title="Sign out"
              className="text-stone-400 hover:text-stone-700 transition-colors p-2 rounded-lg hover:bg-stone-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="md:hidden fixed top-3 left-3 z-30 p-2.5 bg-white border border-stone-200 rounded-xl shadow-sm text-stone-700 hover:bg-stone-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar: slide-in drawer on mobile, fixed on desktop */}
      <aside
        className={`
          fixed h-full z-50 bg-white border-r border-stone-200 flex flex-col w-64
          transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:z-10
        `}
      >
        {sidebarContent}
      </aside>
    </>
  )
}
