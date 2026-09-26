import { useEffect, useRef, useState } from 'react'
import { api } from '../api.ts'
import Button from '../ui/Button.tsx'
import Dot from '../ui/Dot.tsx'
import Eyebrow from '../ui/Eyebrow.tsx'
import InlineText from '../ui/InlineText.tsx'
import { PlayIcon, SparklesIcon, XIcon } from '../ui/icons.tsx'
import { CARD } from '../ui/styles.ts'
import { useWorkspace, type EditorInfo } from './useWorkspace.ts'

const EXTENSION: Record<string, string> = { javascript: 'js', typescript: 'ts', python: 'py' }

// PLACEHOLDER: a plain textarea over a line-by-line mirror. "Run" hits the MOCKED /api/code/run (nothing is
// actually executed). Both layers share one font, line height and grid cell, so a line the tutor points at can be
// tinted in the mirror and scrolled to exactly. Its text lives in the workspace so the tutor can read it.
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
  const { codes, setCode, setActive, highlight, clearHighlight, requestHelp } = useWorkspace()
  const [output, setOutput] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [running, setRunning] = useState(false)
  const mirror = useRef<HTMLDivElement>(null)

  const code = codes[editor.key] ?? initialCode
  const lines = code.split('\n')
  const mine = highlight?.editorKey === editor.key ? highlight : null

  // Register the starter code so the tutor can see it before the student has typed anything.
  useEffect(() => {
    setCode(editor.key, initialCode)
  }, [editor.key, initialCode, setCode])

  // Bring the highlighted line into view: scrolls the editor's own scroller and the page, centred.
  // Re-runs per request (nonce), so pointing at the same line twice still scrolls.
  const spotLine = mine?.line
  const spotNonce = mine?.nonce
  useEffect(() => {
    if (spotLine) mirror.current?.children[spotLine - 1]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [spotLine, spotNonce])

  async function run() {
    setActive(editor)
    setRunning(true)
    try {
      const res = await api.runCode({ code, language })
      setFailed(res.exitCode !== 0)
      setOutput(res.stdout || res.stderr)
    } catch (err) {
      setFailed(true)
      setOutput(err instanceof Error ? err.message : 'Run failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className={`overflow-hidden ${CARD}`}>
      <div className="flex h-11 items-center justify-between border-b border-border bg-surface-soft px-4">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <i className="size-2.5 rounded-full bg-coral" />
          <i className="size-2.5 rounded-full bg-amber" />
          <i className="size-2.5 rounded-full bg-leaf" />
        </div>
        <span className="text-[11px] font-medium tracking-wide text-muted font-mono">
          {filename}.{EXTENSION[language] ?? 'txt'}
        </span>
        <Eyebrow>{language}</Eyebrow>
      </div>

      {(prompt || instructions) && (
        <div className="flex flex-col gap-1.5 border-b border-border px-5 py-4 text-sm leading-relaxed">
          {prompt && (
            <p className="m-0 font-medium text-ink">
              <InlineText text={prompt} />
            </p>
          )}
          {instructions && (
            <p className="m-0 whitespace-pre-line text-muted">
              <InlineText text={instructions} />
            </p>
          )}
        </div>
      )}

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

      {/* One scroller for gutter + code, so line numbers scroll with the text. */}
      <div className="grid max-h-[26rem] min-h-28 grid-cols-[auto_minmax(0,1fr)] overflow-auto bg-surface py-3 text-[13.5px] leading-6 font-mono">
        <div aria-hidden="true" className="sticky left-0 z-10 flex flex-col bg-surface-soft text-right text-subtle select-none">
          {lines.map((_, i) => {
            const marked = mine && i + 1 >= mine.line && i + 1 <= mine.endLine
            return (
              <div key={i} className={`h-6 px-3 ${marked ? 'bg-peach font-medium text-peach-ink' : ''}`}>
                {i + 1}
              </div>
            )
          })}
        </div>
        <div className="grid">
          <div ref={mirror} aria-hidden="true" className="pointer-events-none col-start-1 row-start-1 min-w-max text-transparent select-none">
            {lines.map((line, i) => {
              const marked = mine && i + 1 >= mine.line && i + 1 <= mine.endLine
              return (
                <div key={i} className={`h-6 px-4 whitespace-pre ${marked ? 'bg-peach shadow-[inset_3px_0_0_var(--color-coral)]' : ''}`}>
                  {line || ' '}
                </div>
              )
            })}
          </div>
          <label className="sr-only" htmlFor={`editor-${editor.key}`}>
            Code editor: {editor.label}
          </label>
          {/* Font utilities are `!` because app.css sets `textarea { font: inherit }` (see ui/styles.ts). */}
          <textarea
            id={`editor-${editor.key}`}
            className="col-start-1 row-start-1 m-0 block w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent px-4 py-0 text-[13.5px]! leading-6! font-normal! whitespace-pre text-code outline-none font-mono!"
            value={code}
            rows={lines.length}
            wrap="off"
            onChange={(e) => {
              setCode(editor.key, e.target.value)
              // Line numbers shift as they edit, so an old highlight would point at the wrong place.
              if (mine) clearHighlight()
            }}
            onFocus={() => setActive(editor)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-soft px-4 py-3">
        <span className="flex items-center gap-2 text-xs text-muted">
          <Dot live={running} />
          {running ? 'Running…' : 'Ready to run'}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => requestHelp(editor, failed ? (output ?? undefined) : undefined)}>
            <SparklesIcon className="size-3.5" />
            Find the error
          </Button>
          <Button variant="primary" size="sm" onClick={run} disabled={running}>
            <PlayIcon className="size-3.5" />
            Run code
          </Button>
        </div>
      </div>

      {output !== null && (
        <div className="flex flex-col gap-2.5 border-t border-border bg-ink px-5 py-4" role="status">
          <Eyebrow className={failed ? 'text-peach' : 'text-subtle'}>{failed ? 'Error' : 'Output'}</Eyebrow>
          <pre className="m-0 max-h-52 overflow-auto text-[13px] leading-6 whitespace-pre-wrap text-surface-soft font-mono">{output}</pre>
        </div>
      )}
    </section>
  )
}
