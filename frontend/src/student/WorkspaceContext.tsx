import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { WorkspaceContext, type CodeHighlight, type EditorInfo, type HelpRequest, type WorkspaceState } from './useWorkspace.ts'

/**
 * Connects the lesson's code editors to the tutor column: the tutor reads the active editor's code and
 * answers with a highlight the editor then marks and scrolls to. Code survives switching lessons (keys are
 * exercise ids); the active editor, highlight and help request belong to one lesson and reset with it.
 */
export function WorkspaceProvider({ moduleId, children }: { moduleId: string | null; children: ReactNode }) {
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [runErrors, setRunErrors] = useState<Record<string, string>>({})
  const [active, setActiveEditor] = useState<EditorInfo | null>(null)
  const [highlight, setHighlight] = useState<CodeHighlight | null>(null)
  const [helpRequest, setHelpRequest] = useState<HelpRequest | null>(null)
  const nonce = useRef(0)

  // Adjust state during render (not in an effect) when the lesson changes, so no stale editor is ever sent to the tutor.
  const [seenModule, setSeenModule] = useState(moduleId)
  if (seenModule !== moduleId) {
    setSeenModule(moduleId)
    setActiveEditor(null)
    setHighlight(null)
    setHelpRequest(null)
    setRunErrors({})
  }

  const setCode = useCallback((key: string, code: string) => setCodes((c) => (c[key] === code ? c : { ...c, [key]: code })), [])
  const setRunError = useCallback(
    (key: string, error?: string) =>
      setRunErrors((errors) => {
        if (error) return errors[key] === error ? errors : { ...errors, [key]: error }
        if (!(key in errors)) return errors
        const { [key]: _, ...remaining } = errors
        return remaining
      }),
    [],
  )
  // Editors pass a fresh object each render; only swap state when the editor actually changes.
  const setActive = useCallback(
    (editor: EditorInfo) => setActiveEditor((a) => (a?.key === editor.key && a.label === editor.label ? a : editor)),
    [],
  )
  const showHighlight = useCallback((h: Omit<CodeHighlight, 'nonce'>) => setHighlight({ ...h, nonce: ++nonce.current }), [])
  const clearHighlight = useCallback(() => setHighlight(null), [])
  const requestHelp = useCallback(
    (editor: EditorInfo, error?: string) => {
      setActive(editor)
      setHelpRequest({ nonce: ++nonce.current, error })
    },
    [setActive],
  )

  const value = useMemo<WorkspaceState>(
    () => ({ codes, setCode, runErrors, setRunError, active, setActive, highlight, showHighlight, clearHighlight, helpRequest, requestHelp }),
    [codes, setCode, runErrors, setRunError, active, setActive, highlight, showHighlight, clearHighlight, helpRequest, requestHelp],
  )
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
