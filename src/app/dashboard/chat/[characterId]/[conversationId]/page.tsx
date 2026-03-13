import { auth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
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
  system_prompt: string | null
  avatar_url: string | null
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

  const userId = session.user.id ?? session.user.email
  const supabase = createAdminClient()

  // Handle "new" conversation — create one and redirect to it
  if (conversationId === 'new') {
    const { data: conv } = await supabase
      .from('conversations')
      .insert({
        user_id: userId!,
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
    .select('id, title, character_id, characters(id, name, description, system_prompt, avatar_url)')
    .eq('id', conversationId)
    .eq('user_id', userId!)
    .single()

  if (convErr || !conversation) notFound()

  const conv = conversation as unknown as Conversation

  // Load message history
  const { data: messages } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at, retrieved_chunks')
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
