import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { SupabaseClient } from '@supabase/supabase-js'

type RouteParams = { params: Promise<{ id: string }> }

async function resolveActualUserId(supabase: SupabaseClient, email: string): Promise<string | null> {
  const { data } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single()
  return data?.id ?? null
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('characters')
    .select('*, documents(id, filename, file_type, status, chunk_count, content_length, error_message, created_at)')
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
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
  const userId = await resolveActualUserId(supabase, email)
  if (!userId) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 })
  }

  const body = await req.json() as Record<string, unknown>
  // Remove fields that should not be updated directly
  const { user_id: _u, id: _i, created_at: _c, ...updates } = body

  const { data, error } = await supabase
    .from('characters')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
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
  const userId = await resolveActualUserId(supabase, email)
  if (!userId) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 })
  }

  const { error } = await supabase
    .from('characters')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
