import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAdminClient, resolveUserIdByEmail } from '@/lib/supabase'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
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

  const { data, error } = await supabase
    .from('characters')
    .select('*, documents(id, filename, file_type, status, chunk_count, content_length, error_message, created_at)')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (error) {
    return NextResponse.json({ error: 'Character not found' }, { status: 404 })
  }

  return NextResponse.json({ character: data })
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
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

  const body = await req.json() as {
    name?: string; description?: string; system_prompt?: string; is_public?: boolean
  }
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.description !== undefined) updates.description = body.description
  if (body.system_prompt !== undefined) updates.system_prompt = body.system_prompt
  if (body.is_public !== undefined) updates.is_public = body.is_public

  const { data, error } = await supabase
    .from('characters')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('[characters] PATCH error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ character: data })
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
    .from('characters')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    console.error('[characters] DELETE error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
