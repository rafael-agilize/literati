import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'

type RouteParams = { params: Promise<{ id: string }> }

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
  const userId = session?.user?.email ?? session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as Record<string, unknown>
  // Remove fields that should not be updated directly
  const { user_id: _u, id: _i, created_at: _c, ...updates } = body

  const supabase = createAdminClient()
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
  const userId = session?.user?.email ?? session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
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
