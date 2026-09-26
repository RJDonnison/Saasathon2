import { createContext, useContext } from 'react'

/** One code editor on the page: a lesson's code exercise, or the free playground. */
export interface EditorInfo {
  /** Unique on the page (the exercise id, or `playground`). */
  key: string
  /** Shown to the student so they know which code the tutor is looking at. */
  label: string
  /** Only for real code exercises; sent to the tutor so it can see the task. */
  exerciseId?: string
}

/** A spot the tutor pointed at. `nonce` changes on every request so the editor re-scrolls even for the same line. */
export interface CodeHighlight {
  editorKey: string
  line: number
  endLine: number
  note: string
  nonce: number
}

/** A request (from an editor) for the tutor to look at code, optionally with the run error that prompted it. */
export interface HelpRequest {
  nonce: number
  error?: string
}

export interface WorkspaceState {
  /** Current text of every editor that has mounted, by editor key. */
  codes: Record<string, string>
  setCode: (key: string, code: string) => void
  /** The editor the student last touched; the tutor sees its code. */
  active: EditorInfo | null
  setActive: (editor: EditorInfo) => void
  highlight: CodeHighlight | null
  showHighlight: (h: Omit<CodeHighlight, 'nonce'>) => void
  clearHighlight: () => void
  helpRequest: HelpRequest | null
  /** Make `editor` active and ask the tutor to find what's wrong in it. */
  requestHelp: (editor: EditorInfo, error?: string) => void
}

export const WorkspaceContext = createContext<WorkspaceState | null>(null)

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}
