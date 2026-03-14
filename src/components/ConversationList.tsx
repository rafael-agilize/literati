'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MessageSquare, Clock, Trash2 } from 'lucide-react'

type Conversation = {
  id: string
  title: string
  message_count: number
  created_at: string
  updated_at: string
}

export default function ConversationList({
  conversations: initial,
  characterId,
}: {
  conversations: Conversation[]
  characterId: string
}) {
  const [conversations, setConversations] = useState(initial)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(convId: string) {
    if (!confirm('Delete this conversation? This cannot be undone.')) return

    setDeleting(convId)
    try {
      const res = await fetch(`/api/conversations/${convId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setConversations((prev) => prev.filter((c) => c.id !== convId))
    } catch {
      alert('Failed to delete conversation. Please try again.')
    } finally {
      setDeleting(null)
    }
  }

  if (conversations.length === 0) return null

  return (
    <div className="space-y-3">
      {conversations.map((conv) => (
        <div
          key={conv.id}
          className="flex items-center bg-white border border-stone-200 rounded-2xl hover:border-amber-300 hover:shadow-md transition-all group"
        >
          <Link
            href={`/dashboard/chat/${characterId}/${conv.id}`}
            className="flex-1 min-w-0 px-5 py-4"
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
                  <span className="text-stone-300 text-xs">&middot;</span>
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
          <button
            onClick={() => handleDelete(conv.id)}
            disabled={deleting === conv.id}
            title="Delete conversation"
            className="mr-4 p-2 rounded-lg text-stone-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <Trash2 className={`w-4 h-4 ${deleting === conv.id ? 'animate-pulse' : ''}`} />
          </button>
        </div>
      ))}
    </div>
  )
}
