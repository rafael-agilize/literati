import { auth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import FileUpload from '@/components/FileUpload'
import DocumentList, { type UploadedDoc } from '@/components/DocumentList'

type Character = {
  id: string
  name: string
  description: string | null
  system_prompt: string | null
  is_public: boolean
  document_count: number
  chunk_count: number
  documents: UploadedDoc[]
}

export default async function CharacterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect('/login')

  const supabase = createAdminClient()
  const { data: character, error } = await supabase
    .from('characters')
    .select('*, documents(id, filename, file_type, status, chunk_count, content_length, error_message, created_at)')
    .eq('id', id)
    .single()

  if (error || !character) notFound()

  const char = character as unknown as Character

  return (
    <div className="p-4 md:p-8 max-w-3xl">
      {/* Back nav */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-stone-500 hover:text-stone-800 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to characters
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-orange-200">
            {char.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">{char.name}</h1>
            {char.description && (
              <p className="text-stone-500 mt-0.5 text-sm max-w-md">{char.description}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-stone-400">
                {char.document_count} doc{char.document_count !== 1 ? 's' : ''}
              </span>
              <span className="text-stone-300">·</span>
              <span className="text-xs text-stone-400">
                {char.chunk_count.toLocaleString()} chunks
              </span>
              {char.is_public && (
                <>
                  <span className="text-stone-300">·</span>
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    Public
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <Link
          href={`/dashboard/chat/${char.id}`}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-5 py-2.5 rounded-xl font-semibold hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm hover:shadow-md text-sm"
        >
          <MessageSquare className="w-4 h-4" />
          Start Chat
        </Link>
      </div>

      {/* Upload section */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-stone-900 mb-1">Upload Documents</h2>
        <p className="text-stone-500 text-sm mb-4">
          Add books, essays, or any text to train this character&apos;s persona.
          Supported: PDF, DOCX, TXT, CSV, EPUB
        </p>
        <FileUpload characterId={char.id} />
      </section>

      {/* Documents list */}
      <section>
        <h2 className="text-lg font-semibold text-stone-900 mb-4">
          Documents ({char.documents?.length ?? 0})
        </h2>
        <DocumentList
          characterId={char.id}
          initialDocuments={char.documents ?? []}
        />
      </section>
    </div>
  )
}
