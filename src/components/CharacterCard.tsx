'use client'

import Link from 'next/link'
import { FileText, MessageSquare, Globe, Lock } from 'lucide-react'

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

export default function CharacterCard({ character }: { character: Character }) {
  const initial = character.name.charAt(0).toUpperCase()

  // Generate a consistent color based on the character name
  const colors = [
    'from-amber-400 to-orange-500',
    'from-orange-400 to-red-500',
    'from-yellow-400 to-amber-500',
    'from-lime-400 to-green-500',
    'from-teal-400 to-cyan-500',
    'from-blue-400 to-indigo-500',
    'from-violet-400 to-purple-500',
    'from-pink-400 to-rose-500',
  ]
  const colorIndex = character.name.charCodeAt(0) % colors.length
  const gradient = colors[colorIndex]

  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden hover:border-amber-300 hover:shadow-lg hover:shadow-amber-100 transition-all group">
      {/* Card header */}
      <div className={`bg-gradient-to-br ${gradient} p-6 relative`}>
        <div className="flex items-start justify-between">
          <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-2xl font-bold shadow-inner">
            {initial}
          </div>
          <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-2.5 py-1 text-white text-xs font-medium">
            {character.is_public ? (
              <>
                <Globe className="w-3 h-3" />
                Public
              </>
            ) : (
              <>
                <Lock className="w-3 h-3" />
                Private
              </>
            )}
          </div>
        </div>
        <h3 className="text-white font-bold text-lg mt-4 leading-tight">{character.name}</h3>
      </div>

      {/* Card body */}
      <div className="p-5">
        {character.description ? (
          <p className="text-stone-600 text-sm line-clamp-2 mb-4 leading-relaxed">
            {character.description}
          </p>
        ) : (
          <p className="text-stone-400 text-sm italic mb-4">No description</p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-stone-400 mb-5">
          <span className="flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" />
            {character.document_count} doc{character.document_count !== 1 ? 's' : ''}
          </span>
          <span className="text-stone-200">|</span>
          <span className="flex items-center gap-1">
            <MessageSquare className="w-3.5 h-3.5" />
            {character.chunk_count.toLocaleString()} chunks
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Link
            href={`/dashboard/chat/${character.id}`}
            className="flex-1 text-center bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm"
          >
            Chat
          </Link>
          <Link
            href={`/dashboard/characters/${character.id}`}
            className="px-4 py-2 rounded-xl border border-stone-200 text-stone-600 text-sm font-medium hover:bg-stone-50 hover:border-stone-300 transition-all"
          >
            Manage
          </Link>
        </div>
      </div>
    </div>
  )
}
