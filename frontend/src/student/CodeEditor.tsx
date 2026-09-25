import { useState } from 'react'
import { api } from '../api.ts'

// PLACEHOLDER: plain textarea. "Run" hits the MOCKED /api/code/run (nothing is actually executed).
export default function CodeEditor() {
  const [code, setCode] = useState('console.log(1 + 2)')
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)

  async function run() {
    setRunning(true)
    try {
      const res = await api.runCode({ code, language: 'javascript' })
      setOutput(res.stdout || res.stderr)
    } catch (err) {
      setOutput(err instanceof Error ? err.message : 'Run failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="rounded border bg-white p-4">
      <h2 className="mb-2 font-semibold">Code editor</h2>
      <textarea
        className="h-32 w-full rounded border p-2 font-mono text-sm"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button onClick={run} disabled={running} className="mt-2 rounded bg-green-600 px-3 py-1 text-white disabled:opacity-50">
        {running ? 'Running…' : 'Run'}
      </button>
      {output && <pre className="mt-2 rounded bg-gray-100 p-2 text-sm">{output}</pre>}
    </section>
  )
}
