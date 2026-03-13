import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import type { Session } from 'next-auth'

function resolveUserId(session: Session | null, req: NextRequest): string | null {
  const apiKey = req.headers.get('x-api-key')
  const isApiAuth = !!apiKey && apiKey === process.env.LITERATI_API_KEY
  if (isApiAuth) {
    return req.headers.get('x-user-id')
  }
  return session?.user?.email ?? session?.user?.id ?? null
}

export async function GET(req: NextRequest) {
  const session = (await auth()) as Session | null
  const userId = resolveUserId(session, req)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const characterId = searchParams.get('characterId')

  const supabase = createAdminClient()
  let query = supabase
    .from('conversations')
    .select('*, characters(name, avatar_url, description)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (characterId) {
    query = query.eq('character_id', characterId)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ conversations: data })
}

export async function POST(req: NextRequest) {
  const session = (await auth()) as Session | null
  const userId = resolveUserId(session, req)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { characterId?: string; title?: string }
  if (!body.characterId) {
    return NextResponse.json({ error: 'characterId is required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: userId,
      character_id: body.characterId,
      title: body.title?.trim() || 'New conversation',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ conversation: data }, { status: 201 })
}
