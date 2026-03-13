import { auth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, MessageSquare, Clock } from 'lucide-react'

type Conversation = {
  id: string
  title: string
  message_count: number
  created_at: string
  updated_at: string
}

export default async function CharacterChatListPage({
  params,
}: {
  params: Promise<{ characterId: string }>
}) {
  const { characterId } = await params
  const session = await auth()
  if (!session?.user) redirect('/login')

  const userId = session.user.id ?? session.user.email
  const supabase = createAdminClient()

  const { data: character } = await supabase
    .from('characters')
    .select('id, name, description, documents(id)')
    .eq('id', characterId)
    .single()

  if (!character) notFound()

  const hasDocuments = (character.documents as unknown[] | null)?.length ?? 0 > 0

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, title, message_count, created_at, updated_at')
    .eq('character_id', characterId)
    .eq('user_id', userId!)
    .order('updated_at', { ascending: false })

  const convs = (conversations ?? []) as Conversation[]

  return (
    <div className="p-8 max-w-2xl">
      {/* Back nav */}
      <Link
        href={`/dashboard/characters/${characterId}`}
        className="inline-flex items-center gap-2 text-stone-500 hover:text-stone-800 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to character
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">
            Chat with {character.name}
          </h1>
          {character.description && (
            <p className="text-stone-500 text-sm mt-1">{character.description}</p>
          )}
        </div>
        <Link
          href={`/dashboard/chat/${characterId}/new`}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2.5 rounded-xl font-semibold hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm text-sm"
        >
          <Plus className="w-4 h-4" />
          New Conversation
        </Link>
      </div>

      {/* Warning if no documents */}
      {!hasDocuments && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-6">
          No documents uploaded yet. The character will respond based on general knowledge only.{' '}
          <Link
            href={`/dashboard/characters/${characterId}`}
            className="underline font-medium hover:text-amber-900"
          >
            Upload documents
          </Link>{' '}
          to improve responses.
        </div>
      )}

      {/* Conversations list */}
      {convs.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-100 mb-4">
            <MessageSquare className="w-8 h-8 text-amber-500" />
          </div>
          <h2 className="text-lg font-semibold text-stone-900 mb-2">No conversations yet</h2>
          <p className="text-stone-500 text-sm mb-6">
            Start a new conversation with {character.name}.
          </p>
          <Link
            href={`/dashboard/chat/${characterId}/new`}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-5 py-2.5 rounded-xl font-semibold hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm text-sm"
          >
            <Plus className="w-4 h-4" />
            Start Conversation
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {convs.map((conv) => (
            <Link
              key={conv.id}
              href={`/dashboard/chat/${characterId}/${conv.id}`}
              className="block bg-white border border-stone-200 rounded-2xl px-5 py-4 hover:border-amber-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-stone-900 group-hover:text-amber-800 transition-colors truncate">
                    {conv.title}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-stone-400 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {conv.message_count} message{conv.message_count !== 1 ? 's' : ''}
                    </span>
                    <span className="text-stone-300 text-xs">·</span>
                    <span className="text-xs text-stone-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(conv.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="text-stone-300 group-hover:text-amber-400 transition-colors ml-3">
                  &rarr;
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
