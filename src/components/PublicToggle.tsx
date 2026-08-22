'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function PublicToggle({
  characterId,
  initialIsPublic,
}: {
  characterId: string
  initialIsPublic: boolean
}) {
  const router = useRouter()
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [saving, setSaving] = useState(false)

  async function handleToggle() {
    if (saving) return

    const nextIsPublic = !isPublic
    setIsPublic(nextIsPublic)
    setSaving(true)

    try {
      const res = await fetch(`/api/characters/${characterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: nextIsPublic }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        alert(body?.error ?? 'Failed to update character visibility')
        setIsPublic(!nextIsPublic)
        return
      }

      router.refresh()
    } catch {
      alert('Failed to update character visibility')
      setIsPublic(!nextIsPublic)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-3 mb-8">
      <button
        type="button"
        role="switch"
        aria-checked={isPublic}
        aria-label="Make character public"
        disabled={saving}
        onClick={handleToggle}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:cursor-wait disabled:opacity-60 ${
          isPublic ? 'bg-amber-500' : 'bg-stone-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            isPublic ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      <div>
        <p className="text-sm font-medium text-stone-700">Make public</p>
        <p className="text-xs text-stone-400">
          Public characters are accessible via the relay API
        </p>
      </div>
    </div>
  )
}
