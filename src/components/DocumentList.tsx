'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, Loader2, CheckCircle, AlertCircle, Trash2, RefreshCw } from 'lucide-react'

export type DocumentStatus = 'processing' | 'ready' | 'error'

export type UploadedDoc = {
  id: string
  filename: string
  file_type: string
  status: DocumentStatus
  chunk_count: number
  content_length: number
  error_message: string | null
  created_at: string
}

interface DocumentListProps {
  characterId: string
  initialDocuments: UploadedDoc[]
}

export default function DocumentList({ characterId, initialDocuments }: DocumentListProps) {
  const [documents, setDocuments] = useState<UploadedDoc[]>(initialDocuments)
  const [refreshing, setRefreshing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const hasProcessing = documents.some((d) => d.status === 'processing')

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch(`/api/documents?characterId=${characterId}`)
      if (res.ok) {
        const data = await res.json() as { documents?: UploadedDoc[] }
        setDocuments(data.documents ?? [])
      }
    } finally {
      setRefreshing(false)
    }
  }, [characterId])

  // Auto-poll while any document is processing
  useEffect(() => {
    if (!hasProcessing) return
    const interval = setInterval(refresh, 3000)
    return () => clearInterval(interval)
  }, [hasProcessing, refresh])

  async function handleDelete(docId: string) {
    if (!confirm('Delete this document? All associated chunks will be removed.')) return
    setDeletingId(docId)
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' })
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== docId))
      }
    } finally {
      setDeletingId(null)
    }
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-10 border-2 border-dashed border-stone-200 rounded-2xl">
        <FileText className="w-8 h-8 text-stone-300 mx-auto mb-2" />
        <p className="text-sm text-stone-400">No documents uploaded yet.</p>
      </div>
    )
  }

  return (
    <div>
      {hasProcessing && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-800 mb-4">
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 text-blue-600" />
          <span>Processing documents... auto-refreshing every 3s</span>
        </div>
      )}

      <div className="space-y-2">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl px-4 py-3"
          >
            <StatusIcon status={doc.status} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-stone-900 truncate">{doc.filename}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {doc.status === 'processing' && (
                  <span className="text-xs text-blue-600">Processing...</span>
                )}
                {doc.status === 'ready' && (
                  <span className="text-xs text-stone-400">
                    {doc.chunk_count.toLocaleString()} chunks ·{' '}
                    {(doc.content_length / 1000).toFixed(1)}k chars
                  </span>
                )}
                {doc.status === 'error' && (
                  <span className="text-xs text-red-600 truncate max-w-xs">
                    {doc.error_message ?? 'Processing failed'}
                  </span>
                )}
              </div>
            </div>
            <span className="text-xs text-stone-400 flex-shrink-0">
              {new Date(doc.created_at).toLocaleDateString()}
            </span>
            <button
              onClick={() => handleDelete(doc.id)}
              disabled={deletingId === doc.id}
              title="Delete document"
              className="text-stone-300 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50 flex-shrink-0 disabled:opacity-50"
            >
              {deletingId === doc.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={refresh}
        disabled={refreshing}
        className="mt-4 flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-700 transition-colors"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        Refresh list
      </button>
    </div>
  )
}

function StatusIcon({ status }: { status: DocumentStatus }) {
  switch (status) {
    case 'processing':
      return <Loader2 className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" />
    case 'ready':
      return <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
    case 'error':
      return <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
  }
}
