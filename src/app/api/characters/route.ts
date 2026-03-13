import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import type { Session } from 'next-auth'

export async function GET(req: NextRequest) {
  const session = (await auth()) as Session | null
  const userEmail = session?.user?.email ?? null

  const apiKey = req.headers.get('x-api-key')
  const isApiAuth = !!apiKey && apiKey === process.env.LITERATI_API_KEY

  if (!userEmail && !isApiAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  let query = supabase
    .from('characters')
    .select('id, name, description, avatar_url, is_public, document_count, chunk_count, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (userEmail && !isApiAuth) {
    // Resolve actual user id from email (handles legacy uuid-based ids)
    const { data: userRow } = await supabase
      .from('users')
      .select('id')
      .eq('email', userEmail)
      .single()

    if (!userRow) {
      return NextResponse.json({ characters: [] })
    }
    query = query.eq('user_id', userRow.id)
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
  const userIdFromSession = session?.user?.email ?? session?.user?.id ?? null

  const apiKey = req.headers.get('x-api-key')
  const isApiAuth = !!apiKey && apiKey === process.env.LITERATI_API_KEY
  const apiUserId = req.headers.get('x-user-id')

  const effectiveUserId = userIdFromSession ?? (isApiAuth && apiUserId ? apiUserId : null)
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
  const userEmail = isApiAuth
    ? `${effectiveUserId}@relay.literati`
    : session?.user?.email ?? effectiveUserId

  // Look up or create user — never assume id = email
  let { data: userRow } = await supabase
    .from('users')
    .select('id')
    .eq('email', userEmail)
    .single()

  if (!userRow) {
    const { data: created } = await supabase
      .from('users')
      .insert({
        id: effectiveUserId,
        email: userEmail,
        name: isApiAuth ? effectiveUserId : session?.user?.name ?? null,
        image: isApiAuth ? null : session?.user?.image ?? null,
      })
      .select('id')
      .single()
    userRow = created
  }

  if (!userRow) {
    return NextResponse.json({ error: 'Failed to resolve user' }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('characters')
    .insert({
      user_id: userRow.id,
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
