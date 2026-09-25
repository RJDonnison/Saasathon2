import { useState, type FormEvent } from 'react'
import { api } from '../api.ts'
import { useAuth } from '../auth/useAuth.ts'
import type { AiChatMessage } from '../../../shared/types'

type Msg = { from: 'me' | 'ai' | 'error'; text: string }

// "I'm stuck" chat, scoped to the module the student is on. The AI gives hints, not answers.
// The server is stateless: we re-send the transcript (minus errors) with every question.
// Mount with key={moduleId} so switching modules starts a fresh conversation.
export default function AiChatPanel({ moduleId }: { moduleId: string }) {
  const { user } = useAuth()
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [thinking, setThinking] = useState(false)

  async function ask(e: FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (!user || !q || thinking) return
    const history: AiChatMessage[] = messages
      .filter((m) => m.from !== 'error')
      .map((m) => ({ role: m.from === 'me' ? 'user' : 'assistant', text: m.text }))
    setQuestion('')
    setMessages((m) => [...m, { from: 'me', text: q }])
    setThinking(true)
    try {
      const { reply } = await api.aiHint({ moduleId, studentId: user.id, question: q, history })
      setMessages((m) => [...m, { from: 'ai', text: reply }])
    } catch (err) {
      setMessages((m) => [...m, { from: 'error', text: err instanceof Error ? err.message : 'Request failed' }])
    } finally {
      setThinking(false)
    }
  }

  return (
    <section className="rounded border bg-white p-4">
      <h2 className="mb-2 font-semibold">I'm stuck</h2>
      <ul className="mb-2 space-y-1 text-sm">
        {messages.map((m, i) => (
          <li
            key={i}
            className={m.from === 'me' ? 'text-gray-900' : m.from === 'ai' ? 'text-blue-700' : 'text-red-600'}
          >
            <strong>{m.from === 'me' ? 'You' : m.from === 'ai' ? 'Tutor' : 'Error'}:</strong> {m.text}
          </li>
        ))}
        {thinking && <li className="text-gray-500">Tutor is thinking…</li>}
      </ul>
      <form onSubmit={ask} className="flex gap-2">
        <input
          className="flex-1 rounded border px-2 py-1 text-sm"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What are you stuck on?"
          maxLength={2000}
        />
        <button
          type="submit"
          disabled={thinking}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </section>
  )
}
