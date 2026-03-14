import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAdminClient, resolveUserIdByEmail } from '@/lib/supabase'
import type { Session } from 'next-auth'

export async function GET(req: NextRequest) {
  const session = (await auth()) as Session | null

  const apiKey = req.headers.get('x-api-key')
  const isApiAuth = !!apiKey && apiKey === process.env.LITERATI_API_KEY

  const supabase = createAdminClient()
  let userId: string | null = null

  if (isApiAuth) {
    userId = req.headers.get('x-user-id')
  } else if (session?.user?.email) {
    userId = await resolveUserIdByEmail(supabase, session.user.email)
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const characterId = searchParams.get('characterId')

  const limitParam = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50'), 1), 200)

  let query = supabase
    .from('conversations')
    .select('*, characters(name, avatar_url, description)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limitParam)

  if (characterId) {
    query = query.eq('character_id', characterId)
  }

  const { data, error } = await query
  if (error) {
    console.error('[conversations] GET error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ conversations: data })
}

export async function POST(req: NextRequest) {
  const session = (await auth()) as Session | null

  const apiKey = req.headers.get('x-api-key')
  const isApiAuth = !!apiKey && apiKey === process.env.LITERATI_API_KEY

  const supabase = createAdminClient()
  let userId: string | null = null

  if (isApiAuth) {
    userId = req.headers.get('x-user-id')
  } else if (session?.user?.email) {
    userId = await resolveUserIdByEmail(supabase, session.user.email)
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as { characterId?: string; title?: string }
  if (!body.characterId) {
    return NextResponse.json({ error: 'characterId is required' }, { status: 400 })
  }

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
    console.error('[conversations] POST error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ conversation: data }, { status: 201 })
}
