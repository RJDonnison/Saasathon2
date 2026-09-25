import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import { useAuth } from '../auth/useAuth.ts'
import ModuleView from './ModuleView.tsx'
import CodeEditor from './CodeEditor.tsx'
import ScratchPad from './ScratchPad.tsx'
import AiChatPanel from './AiChatPanel.tsx'
import RaiseHandButton from './RaiseHandButton.tsx'
import type { Module } from '../../../shared/types'

export default function StudentHome() {
  const { user } = useAuth()
  const [modules, setModules] = useState<Module[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    api
      .listModules(user.classroomId)
      .then((list) => {
        if (cancelled) return
        setModules(list)
        setCurrentId((id) => id ?? list[0]?.id ?? null)
      })
      .catch(console.error)
    return () => {
      cancelled = true
    }
  }, [user])

  const current = modules.find((m) => m.id === currentId) ?? null

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {modules.length > 1 && (
        <label className="text-sm md:col-span-2">
          Current module{' '}
          <select
            className="rounded border px-2 py-1"
            value={currentId ?? ''}
            onChange={(e) => setCurrentId(e.target.value)}
          >
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <ModuleView module={current} />
      <CodeEditor />
      <ScratchPad />
      {current && <AiChatPanel key={current.id} moduleId={current.id} />}
      <RaiseHandButton />
    </div>
  )
}
