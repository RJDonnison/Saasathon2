import { useState } from "react";
import { runCode as runInBrowser } from "../execution/runInBrowser.ts";

// PLACEHOLDER: plain textarea. "Run" executes the code in the browser via a Web Worker.
export default function CodeEditor() {
  const [code, setCode] = useState("console.log(1 + 2)");
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const res = await runInBrowser({ code, language: "javascript" });
      setOutput(
        [res.stdout, res.stderr].filter(Boolean).join("\n") ||
          res.crash ||
          "(no output)",
      );
    } catch (err) {
      setOutput(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
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
      <button
        onClick={run}
        disabled={running}
        className="mt-2 rounded bg-green-600 px-3 py-1 text-white disabled:opacity-50"
      >
        {running ? "Running…" : "Run"}
      </button>
      {output && (
        <pre className="mt-2 rounded bg-gray-100 p-2 text-sm">{output}</pre>
      )}
    </section>
  );
}
