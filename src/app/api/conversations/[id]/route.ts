import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAdminClient, resolveUserIdByEmail } from '@/lib/supabase'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const session = await auth()

  const apiKey = req.headers.get('x-api-key')
  const isApiAuth = !!apiKey && apiKey === process.env.LITERATI_API_KEY
  const apiUserId = req.headers.get('x-user-id')

  const supabase = createAdminClient()
  let effectiveUserId: string | null = null

  if (isApiAuth && apiUserId) {
    effectiveUserId = apiUserId
  } else if (session?.user?.email) {
    effectiveUserId = await resolveUserIdByEmail(supabase, session.user.email)
  }

  if (!effectiveUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)

  // Fetch conversation with character details
  const { data: conversation, error: convErr } = await supabase
    .from('conversations')
    .select('*, characters(id, name, avatar_url, description, system_prompt)')
    .eq('id', id)
    .eq('user_id', effectiveUserId)
    .single()

  if (convErr) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  // Fetch messages for this conversation
  const { data: messages, error: msgErr } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at, retrieved_chunks')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (msgErr) {
    console.error('[conversations] messages query error:', msgErr.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ conversation, messages: messages ?? [] })
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const session = await auth()
  const email = session?.user?.email
  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { title } = await req.json() as { title?: string }
  if (!title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const userId = await resolveUserIdByEmail(supabase, email)
  if (!userId) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('conversations')
    .update({ title: title.trim(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('[conversations] PATCH error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ conversation: data })
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const session = await auth()
  const email = session?.user?.email
  if (!email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const userId = await resolveUserIdByEmail(supabase, email)
  if (!userId) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 })
  }

  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    console.error('[conversations] DELETE error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
