import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { OnMount } from '@monaco-editor/react'
import { api } from '../api.ts'
import Button from '../ui/Button.tsx'
import InlineText from '../ui/InlineText.tsx'
import { PlayIcon, SparklesIcon, XIcon } from '../ui/icons.tsx'
import { CARD } from '../ui/styles.ts'
import { useWorkspace, type EditorInfo } from './useWorkspace.ts'

const EXTENSION: Record<string, string> = { javascript: 'js', typescript: 'ts', python: 'py' }
// Monaco is substantial; lesson pages load it only when a code segment is actually rendered.
const MonacoEditor = lazy(() => import('@monaco-editor/react'))

// Monaco owns the editing experience (syntax highlighting, keyboard navigation and its gutter). Editor text still
// lives in the workspace so the tutor can inspect it, and Monaco decorations mark the line the tutor points to.
export default function CodeEditor({
  editor,
  filename,
  language,
  initialCode,
  prompt,
  instructions,
}: {
  editor: EditorInfo
  /** Shown in the window title bar, without extension. */
  filename: string
  language: string
  initialCode: string
  /** The task, and any extra detail, shown above the editor. */
  prompt?: string
  instructions?: string
}) {
  const { codes, setCode, setRunError, setActive, highlight, clearHighlight, requestHelp } = useWorkspace()
  const [output, setOutput] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [running, setRunning] = useState(false)
  const [mounted, setMounted] = useState(false)
  const monacoEditor = useRef<Parameters<OnMount>[0] | null>(null)
  const decorations = useRef<ReturnType<Parameters<OnMount>[0]['createDecorationsCollection']> | null>(null)

  const code = codes[editor.key] ?? initialCode
  const mine = highlight?.editorKey === editor.key ? highlight : null

  // Register the starter code so the tutor can see it before the student has typed anything.
  useEffect(() => {
    if (!(editor.key in codes)) setCode(editor.key, initialCode)
  }, [codes, editor.key, initialCode, setCode])

  // Bring the highlighted line into view and tint it. Re-runs per request (nonce), so pointing at the
  // same line twice still scrolls.
  const spotLine = mine?.line
  const spotNonce = mine?.nonce
  useEffect(() => {
    if (!mounted || !monacoEditor.current || !decorations.current) return
    if (!mine) {
      decorations.current.set([])
      return
    }
    decorations.current.set([
      {
        range: {
          startLineNumber: mine.line,
          startColumn: 1,
          endLineNumber: mine.endLine,
          endColumn: 1,
        },
        options: { isWholeLine: true, className: 'bg-peach/60' },
      },
    ])
    monacoEditor.current.revealLineInCenter(mine.line)
    monacoEditor.current.getDomNode()?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [mine, mounted, spotLine, spotNonce])

  const onMount: OnMount = (instance) => {
    monacoEditor.current = instance
    decorations.current = instance.createDecorationsCollection()
    instance.onDidFocusEditorText(() => setActive(editor))
    setMounted(true)
  }

  async function run() {
    setActive(editor)
    setRunning(true)
    try {
      const res = await api.runCode({ code, language })
      const failed = res.exitCode !== 0
      const output =
        [res.stdout, res.stderr].filter(Boolean).join('\n') ||
        (failed ? 'Execution failed with no output.' : 'Program finished with no output.')
      setFailed(failed)
      setOutput(output)
      setRunError(editor.key, failed ? output : undefined)
      // Keep a record of runs on real exercises (not the playground) so the student's class page and their
      // teacher can see how the work is going. Best effort: a failed save must not disturb the run.
      if (editor.exerciseId) {
        void api
          .createSubmission({ codeExerciseId: editor.exerciseId, code, stdout: res.stdout, stderr: res.stderr, passed: !failed })
          .catch((err) => console.warn('Could not save this run:', err))
      }
    } catch (err) {
      const output = err instanceof Error ? err.message : 'Run failed'
      setFailed(true)
      setOutput(output)
      setRunError(editor.key, output)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {(prompt || instructions) && (
        <section className={`flex flex-col gap-2.5 p-5 sm:p-6 ${CARD}`}>
          <span className="w-fit rounded-lg border border-border bg-surface-soft px-2.5 py-1 text-xs font-semibold text-ink capitalize">{language}</span>
          {prompt && (
            <p className="m-0 text-[17px] leading-snug font-semibold text-ink">
              <InlineText text={prompt} />
            </p>
          )}
          {instructions && (
            <p className="m-0 text-[15px] leading-relaxed whitespace-pre-line text-ink">
              <InlineText text={instructions} />
            </p>
          )}
        </section>
      )}

      <section className={`overflow-hidden ${CARD}`}>
        <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-soft px-4 py-3">
          <span className="min-w-0 truncate text-[13px] font-medium text-ink font-mono">
            {filename}.{EXTENSION[language] ?? 'txt'}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => requestHelp(editor, failed ? (output ?? undefined) : undefined)}>
              <SparklesIcon className="size-3.5" />
              Find the error
            </Button>
            <Button variant="primary" onClick={run} disabled={running}>
              <PlayIcon className="size-3.5" />
              {running ? 'Running…' : 'Run'}
            </Button>
          </div>
        </div>

        {mine && (
          <div role="status" className="flex items-start gap-3 border-b border-border bg-peach px-4 py-2.5 text-peach-ink">
            <span className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] leading-snug">
              <strong className="font-semibold">
                {mine.endLine > mine.line ? `Lines ${mine.line}–${mine.endLine}` : `Line ${mine.line}`}
              </strong>
              {mine.note && <span>{mine.note}</span>}
            </span>
            <Button size="icon-sm" variant="peach" aria-label="Dismiss highlight" onClick={clearHighlight}>
              <XIcon className="size-3.5" />
            </Button>
          </div>
        )}

        <div className="h-[22rem] min-h-28 overflow-hidden bg-surface">
          <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted">Loading editor…</div>}>
            <MonacoEditor
              height="100%"
              defaultLanguage={language}
              language={language}
              value={code}
              theme="vs"
              onMount={onMount}
              onChange={(value) => {
                setCode(editor.key, value ?? '')
                // A run error only applies to the exact code that produced it.
                setRunError(editor.key)
                // Line numbers shift as they edit, so an old highlight would point at the wrong place.
                if (mine) clearHighlight()
              }}
              options={{
                ariaLabel: `Code editor: ${editor.label}`,
                automaticLayout: true,
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                lineHeight: 24,
                minimap: { enabled: false },
                padding: { top: 12, bottom: 12 },
                scrollBeyondLastLine: false,
                tabSize: 2,
                wordWrap: 'off',
              }}
            />
          </Suspense>
        </div>

        {output !== null && (
          <div className="flex flex-col gap-2 border-t border-border bg-surface-soft px-5 py-4" role="status">
            <span className="text-[13px] font-medium text-muted">{failed ? 'Error' : 'Output'}</span>
            <pre className={`m-0 max-h-52 overflow-auto text-[13px] leading-6 whitespace-pre-wrap font-mono ${failed ? 'text-peach-ink' : 'text-ink'}`}>{output}</pre>
          </div>
        )}
      </section>
    </div>
  )
}
