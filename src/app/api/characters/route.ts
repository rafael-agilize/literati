import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import type { Session } from 'next-auth'

function resolveUserId(session: Session | null): string | null {
  return session?.user?.id ?? session?.user?.email ?? null
}

export async function GET(req: NextRequest) {
  const session = (await auth()) as Session | null
  const userId = resolveUserId(session)

  const apiKey = req.headers.get('x-api-key')
  const isApiAuth = !!apiKey && apiKey === process.env.LITERATI_API_KEY

  if (!userId && !isApiAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  let query = supabase
    .from('characters')
    .select('id, name, description, avatar_url, is_public, document_count, chunk_count, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (userId && !isApiAuth) {
    // Regular user: their own characters only
    query = query.eq('user_id', userId)
  } else {
    // API auth: return only public characters
    query = query.eq('is_public', true)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ characters: data })
}

export async function POST(req: NextRequest) {
  const session = (await auth()) as Session | null
  const userId = resolveUserId(session)

  const apiKey = req.headers.get('x-api-key')
  const isApiAuth = !!apiKey && apiKey === process.env.LITERATI_API_KEY
  const apiUserId = req.headers.get('x-user-id')

  const effectiveUserId = userId ?? (isApiAuth && apiUserId ? apiUserId : null)
  if (!effectiveUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, description, system_prompt, is_public } = body as {
    name?: string
    description?: string
    system_prompt?: string
    is_public?: boolean
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('characters')
    .insert({
      user_id: effectiveUserId,
      name: name.trim(),
      description: description?.trim() ?? null,
      system_prompt: system_prompt?.trim() ?? null,
      is_public: is_public ?? false,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ character: data }, { status: 201 })
}
