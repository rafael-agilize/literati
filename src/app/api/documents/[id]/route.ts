import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createAdminClient, resolveUserIdByEmail } from '@/lib/supabase'

type RouteParams = { params: Promise<{ id: string }> }

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

  // Verify the document belongs to a character owned by this user
  const { data: doc } = await supabase
    .from('documents')
    .select('id, character_id, chunk_count')
    .eq('id', id)
    .single()

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Verify ownership through the parent character
  const { data: character } = await supabase
    .from('characters')
    .select('user_id')
    .eq('id', doc.character_id)
    .single()

  if (!character || character.user_id !== userId) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Delete chunks first (document_chunks has ON DELETE CASCADE, but let's be explicit)
  await supabase.from('document_chunks').delete().eq('document_id', id)

  // Delete the document record
  const { error } = await supabase.from('documents').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Decrement character counters
  await supabase.rpc('increment_character_counts', {
    char_id: doc.character_id,
    doc_delta: -1,
    chunk_delta: -(doc.chunk_count ?? 0),
  })

  return NextResponse.json({ success: true })
}
