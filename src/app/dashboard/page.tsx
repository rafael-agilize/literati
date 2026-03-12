import { auth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import Link from 'next/link'
import { Plus, BookOpen, FileText, MessageSquare } from 'lucide-react'
import CharacterCard from '@/components/CharacterCard'

type Character = {
  id: string
  name: string
  description: string | null
  avatar_url: string | null
  is_public: boolean
  document_count: number
  chunk_count: number
  created_at: string
  updated_at: string
}

export default async function DashboardPage() {
  const session = await auth()
  const userId = session?.user?.id ?? session?.user?.email

  const supabase = createAdminClient()
  const { data: characters } = await supabase
    .from('characters')
    .select('*')
    .eq('user_id', userId!)
    .order('updated_at', { ascending: false })

  const list = (characters ?? []) as Character[]

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">My Characters</h1>
          <p className="text-stone-500 mt-1 text-sm">
            Author personas you&apos;ve created from uploaded books
          </p>
        </div>
        <Link
          href="/dashboard/characters/new"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-5 py-2.5 rounded-xl font-semibold hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm hover:shadow-md text-sm"
        >
          <Plus className="w-4 h-4" />
          New Character
        </Link>
      </div>

      {/* Stats row */}
      {list.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatCard
            icon={<BookOpen className="w-5 h-5 text-amber-600" />}
            label="Characters"
            value={list.length}
            bg="bg-amber-50"
          />
          <StatCard
            icon={<FileText className="w-5 h-5 text-orange-600" />}
            label="Documents"
            value={list.reduce((s, c) => s + (c.document_count ?? 0), 0)}
            bg="bg-orange-50"
          />
          <StatCard
            icon={<MessageSquare className="w-5 h-5 text-yellow-700" />}
            label="Text Chunks"
            value={list.reduce((s, c) => s + (c.chunk_count ?? 0), 0)}
            bg="bg-yellow-50"
          />
        </div>
      )}

      {/* Character grid */}
      {list.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {list.map((character) => (
            <CharacterCard key={character.id} character={character} />
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  bg,
}: {
  icon: React.ReactNode
  label: string
  value: number
  bg: string
}) {
  return (
    <div className={`${bg} rounded-2xl p-5 flex items-center gap-4`}>
      <div className="bg-white rounded-xl p-2.5 shadow-sm">{icon}</div>
      <div>
        <p className="text-2xl font-bold text-stone-900">{value.toLocaleString()}</p>
        <p className="text-sm text-stone-500">{label}</p>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-20">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-amber-100 mb-6">
        <BookOpen className="w-10 h-10 text-amber-500" />
      </div>
      <h2 className="text-xl font-semibold text-stone-900 mb-2">No characters yet</h2>
      <p className="text-stone-500 mb-8 max-w-sm mx-auto">
        Create your first author persona by uploading books, essays, or any text.
      </p>
      <Link
        href="/dashboard/characters/new"
        className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-6 py-3 rounded-xl font-semibold hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm hover:shadow-md"
      >
        <Plus className="w-4 h-4" />
        Create your first character
      </Link>
    </div>
  )
}
