import { useState } from 'react'
import { api } from '../api.ts'
import Button from '../ui/Button.tsx'
import Dot from '../ui/Dot.tsx'
import Eyebrow from '../ui/Eyebrow.tsx'
import { PlayIcon } from '../ui/icons.tsx'
import { CARD } from '../ui/styles.ts'

// PLACEHOLDER: plain textarea. "Run" hits the MOCKED /api/code/run (nothing is actually executed).
export default function CodeEditor() {
  const [code, setCode] = useState('console.log(1 + 2)')
  const [output, setOutput] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [running, setRunning] = useState(false)

  async function run() {
    setRunning(true)
    try {
      const res = await api.runCode({ code, language: 'javascript' })
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
        <span className={`text-[11px] font-medium tracking-wide text-muted font-mono`}>playground.js</span>
        <Eyebrow>JavaScript</Eyebrow>
      </div>
      <label className="sr-only" htmlFor="code-editor">
        Code editor
      </label>
      {/* Font utilities are `!` because app.css sets `textarea { font: inherit }` (see ui/styles.ts). */}
      <textarea
        id="code-editor"
        className={`block h-48 w-full resize-y border-0 bg-surface p-5 text-[13.5px]! leading-[1.7]! font-normal! text-code outline-none focus-visible:bg-canvas font-mono!`}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-soft px-4 py-3">
        <span className="flex items-center gap-2 text-xs text-muted">
          <Dot live={running} />
          {running ? 'Running…' : 'Ready to run'}
        </span>
        <Button variant="primary" size="sm" onClick={run} disabled={running}>
          <PlayIcon className="size-3.5" />
          Run code
        </Button>
      </div>
      {output !== null && (
        <div className="flex flex-col gap-2.5 border-t border-border bg-ink px-5 py-4" role="status">
          <Eyebrow className={`${failed ? 'text-peach' : 'text-subtle'}`}>{failed ? 'Error' : 'Output'}</Eyebrow>
          <pre className={`m-0 max-h-52 overflow-auto text-[13px] leading-6 whitespace-pre-wrap text-surface-soft font-mono`}>{output}</pre>
        </div>
      )}
    </section>
  )
}
