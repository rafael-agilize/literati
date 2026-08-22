import { auth } from '@/lib/auth'
import { createAdminClient, resolveUserIdByEmail } from '@/lib/supabase'
import { redirect, notFound } from 'next/navigation'
import ChatInterface from '@/components/ChatInterface'

type RetrievedChunk = {
  id: string
  content: string
  similarity: number
  source_filename: string
  chunk_index: number
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  retrieved_chunks?: RetrievedChunk[] | null
}

type Character = {
  id: string
  name: string
  description: string | null
  avatar_url: string | null
  user_id: string
  is_public: boolean
}

type Conversation = {
  id: string
  title: string
  character_id: string
  characters: Character
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ characterId: string; conversationId: string }>
}) {
  const { characterId, conversationId } = await params
  const session = await auth()
  if (!session?.user) redirect('/login')

  const supabase = createAdminClient()
  const effectiveUserId = await resolveUserIdByEmail(supabase, session.user.email!)
  if (!effectiveUserId) redirect('/login')

  // Handle "new" conversation — create one and redirect to it
  if (conversationId === 'new') {
    const { data: character } = await supabase
      .from('characters')
      .select('id, user_id, is_public')
      .eq('id', characterId)
      .single()

    if (!character || (character.user_id !== effectiveUserId && !character.is_public)) {
      notFound()
    }

    const { data: conv } = await supabase
      .from('conversations')
      .insert({
        user_id: effectiveUserId,
        character_id: characterId,
        title: 'New conversation',
      })
      .select('id')
      .single()

    if (!conv) redirect(`/dashboard/chat/${characterId}`)
    redirect(`/dashboard/chat/${characterId}/${conv.id}`)
  }

  // Load conversation with character details
  const { data: conversation, error: convErr } = await supabase
    .from('conversations')
    .select('id, title, character_id, characters(id, name, description, avatar_url, user_id, is_public)')
    .eq('id', conversationId)
    .eq('user_id', effectiveUserId)
    .eq('character_id', characterId)
    .single()

  if (convErr || !conversation) notFound()

  const conv = conversation as unknown as Conversation

  if (conv.characters.user_id !== effectiveUserId && !conv.characters.is_public) notFound()
  const isOwner = conv.characters.user_id === effectiveUserId

  // Load message history
  const messagesQuery = isOwner
    ? supabase.from('chat_messages').select('id, role, content, created_at, retrieved_chunks')
    : supabase.from('chat_messages').select('id, role, content, created_at')
  const { data: messages } = await messagesQuery
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(100)

  return (
    <ChatInterface
      characterId={characterId}
      conversationId={conversationId}
      character={conv.characters}
      conversationTitle={conv.title}
      initialMessages={(messages ?? []) as Message[]}
    />
  )
}
