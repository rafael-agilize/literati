'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Send, Loader2, ArrowLeft, Plus, BookOpen } from 'lucide-react'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

type Character = {
  id: string
  name: string
  description: string | null
  system_prompt: string | null
  avatar_url: string | null
}

interface ChatInterfaceProps {
  characterId: string
  conversationId: string
  character: Character
  conversationTitle: string
  initialMessages: Message[]
}

export default function ChatInterface({
  characterId,
  conversationId,
  character,
  conversationTitle,
  initialMessages,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Auto-resize textarea
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return

    // Optimistically add user message
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setError(null)
    setStreaming(true)
    setStreamingContent('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          message: text,
          stream: true,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `Request failed: ${res.status}`)
      }

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        accumulated += chunk
        setStreamingContent(accumulated)
      }

      // Commit streamed message into the list
      const assistantMsg: Message = {
        id: `stream-${Date.now()}`,
        role: 'assistant',
        content: accumulated,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setStreamingContent('')
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Something went wrong')
      // Remove the optimistic user message on error
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id))
    } finally {
      setStreaming(false)
      abortRef.current = null
      textareaRef.current?.focus()
    }
  }, [input, streaming, conversationId])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const characterInitial = character.name.charAt(0).toUpperCase()

  return (
    <div className="flex flex-col h-screen">
      {/* Top nav bar */}
      <header className="bg-white border-b border-stone-200 px-6 py-4 flex items-center gap-4 flex-shrink-0">
        <Link
          href={`/dashboard/chat/${characterId}`}
          className="text-stone-400 hover:text-stone-700 transition-colors p-1.5 rounded-lg hover:bg-stone-100"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0">
            {characterInitial}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-stone-900 text-sm truncate">{character.name}</p>
            <p className="text-xs text-stone-400 truncate">{conversationTitle}</p>
          </div>
        </div>
        <Link
          href={`/dashboard/chat/${characterId}/new`}
          title="New conversation"
          className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-800 transition-colors px-3 py-1.5 rounded-lg hover:bg-stone-100 border border-stone-200"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </Link>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {messages.length === 0 && !streaming && (
          <EmptyConversation
            character={character}
            onSuggestion={(text) => {
              setInput(text)
              textareaRef.current?.focus()
            }}
          />
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} characterName={character.name} />
        ))}

        {/* Streaming assistant message */}
        {streaming && (
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingContent,
              created_at: new Date().toISOString(),
            }}
            characterName={character.name}
            isStreaming={!streamingContent}
          />
        )}

        {error && (
          <div className="flex justify-center">
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700 max-w-md text-center">
              {error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="bg-white border-t border-stone-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-end gap-3 max-w-4xl mx-auto">
          <div className="flex-1 bg-stone-50 border border-stone-200 rounded-2xl px-4 py-3 focus-within:ring-2 focus-within:ring-amber-400 focus-within:border-transparent transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={`Ask ${character.name} something...`}
              rows={1}
              disabled={streaming}
              className="w-full bg-transparent text-stone-900 placeholder-stone-400 text-sm resize-none focus:outline-none disabled:opacity-50 leading-relaxed"
              style={{ minHeight: '24px', maxHeight: '200px' }}
            />
          </div>
          <button
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            className="flex-shrink-0 w-11 h-11 flex items-center justify-center bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {streaming ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-center text-xs text-stone-400 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  characterName,
  isStreaming = false,
}: {
  message: Message
  characterName: string
  isStreaming?: boolean
}) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl rounded-tr-sm px-5 py-3 max-w-[75%] shadow-sm">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0 mt-0.5">
        {characterName.charAt(0)}
      </div>
      <div className="bg-white border border-stone-200 rounded-2xl rounded-tl-sm px-5 py-3 max-w-[75%] shadow-sm">
        {isStreaming ? (
          <div className="flex items-center gap-1.5">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-stone-400">thinking...</span>
          </div>
        ) : (
          <p className="text-sm text-stone-800 leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        )}
      </div>
    </div>
  )
}

function EmptyConversation({
  character,
  onSuggestion,
}: {
  character: Character
  onSuggestion: (text: string) => void
}) {
  const suggestions = [
    `What are your most important ideas?`,
    `How do you approach difficult problems?`,
    `What would you say to someone just beginning to explore your work?`,
  ]

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-3xl font-bold shadow-xl shadow-orange-200 mb-6">
        {character.name.charAt(0)}
      </div>
      <h2 className="text-xl font-bold text-stone-900 mb-2">
        Start a conversation with {character.name}
      </h2>
      {character.description && (
        <p className="text-stone-500 text-sm max-w-sm mb-8">{character.description}</p>
      )}
      <div className="grid grid-cols-1 gap-2 max-w-sm w-full">
        {suggestions.map((s, i) => (
          <button
            key={i}
            className="text-left bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl px-4 py-3 text-sm text-stone-700 hover:text-stone-900 transition-all"
            onClick={() => onSuggestion(s)}
          >
            &ldquo;{s}&rdquo;
          </button>
        ))}
      </div>
    </div>
  )
}
