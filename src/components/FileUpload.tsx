'use client'

import { useState, useRef } from 'react'
import { Upload, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react'

type UploadState = 'idle' | 'uploading' | 'success' | 'error'

interface FileUploadProps {
  characterId: string
  onUploadComplete?: () => void
}

const ACCEPTED_TYPES = '.pdf,.docx,.txt,.csv,.epub,.md'
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

export default function FileUpload({ characterId, onUploadComplete }: FileUploadProps) {
  const [state, setState] = useState<UploadState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) validateAndSetFile(file)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) validateAndSetFile(file)
  }

  function validateAndSetFile(file: File) {
    if (file.size > MAX_FILE_SIZE) {
      setState('error')
      setMessage(`File too large. Maximum size is 50 MB.`)
      return
    }
    setState('idle')
    setMessage(null)
    setSelectedFile(file)
  }

  function clearFile() {
    setSelectedFile(null)
    setState('idle')
    setMessage(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleUpload() {
    if (!selectedFile) return

    setState('uploading')
    setMessage(null)

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('characterId', characterId)

    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? 'Upload failed')

      setState('success')
      setMessage('Upload received! Processing in the background — refresh in a moment.')
      setSelectedFile(null)
      if (inputRef.current) inputRef.current.value = ''
      onUploadComplete?.()
    } catch (err) {
      setState('error')
      setMessage(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !selectedFile && inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
          dragOver
            ? 'border-amber-400 bg-amber-50'
            : selectedFile
            ? 'border-amber-300 bg-amber-50/50 cursor-default'
            : 'border-stone-200 hover:border-amber-300 hover:bg-amber-50/30'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={handleFileSelect}
          className="hidden"
        />

        {selectedFile ? (
          <div className="flex items-center justify-center gap-3">
            <div className="bg-amber-100 rounded-xl p-2.5">
              <Upload className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-stone-900">{selectedFile.name}</p>
              <p className="text-xs text-stone-400">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); clearFile() }}
              className="ml-2 text-stone-400 hover:text-stone-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-stone-100 mb-3">
              <Upload className="w-6 h-6 text-stone-400" />
            </div>
            <p className="text-sm font-medium text-stone-700 mb-1">
              Drop a file here, or{' '}
              <span className="text-amber-600 font-semibold">browse</span>
            </p>
            <p className="text-xs text-stone-400">PDF, DOCX, TXT, CSV, EPUB — up to 50 MB</p>
          </>
        )}
      </div>

      {/* Upload button */}
      {selectedFile && (
        <button
          onClick={handleUpload}
          disabled={state === 'uploading'}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-6 py-3 rounded-xl font-semibold hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {state === 'uploading' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Upload & Process
            </>
          )}
        </button>
      )}

      {/* Status message */}
      {state === 'success' && message && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
          <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-600" />
          <span>{message}</span>
        </div>
      )}

      {state === 'error' && message && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-600" />
          <span>{message}</span>
        </div>
      )}
    </div>
  )
}
