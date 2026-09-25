import { useState } from "react";
import Editor from "@monaco-editor/react";
import { api } from "../api.ts";

const DEFAULT_CODE = `function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet("world"));
`;

const LANGUAGES = ["javascript", "typescript", "python", "java", "cpp", "c"];

export default function CodeEditor() {
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState(DEFAULT_CODE);
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const runCode = async () => {
    setIsRunning(true);
    setOutput("Running...");

    try {
      const result = await api.runCode({ code, language });
      setOutput([result.stdout, result.stderr].filter(Boolean).join("\n") || "(no output)");
    } catch (err) {
      setOutput(`Error: ${err instanceof Error ? err.message : "Run failed"}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex h-96 flex-col">
      <div className="flex gap-2 bg-[#1e1e1e] p-2">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="rounded bg-[#2b2b2b] px-2 py-1 text-white"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
        <button
          onClick={runCode}
          disabled={isRunning}
          className="rounded bg-blue-600 px-4 py-1 text-white disabled:opacity-50"
        >
          {isRunning ? "Running..." : "Run"}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-[2]">
          <Editor
            height="100%"
            language={language}
            theme="vs-dark"
            value={code}
            onChange={(value) => setCode(value ?? "")}
            options={{
              fontSize: 14,
              minimap: { enabled: true },
              automaticLayout: true,
            }}
          />
        </div>
      </div>
      <pre
        className="m-0 flex-1 overflow-auto whitespace-pre-wrap bg-[#181818] p-3 font-mono text-lg text-[#d4d4d4]"
      >
        {output}
      </pre>
    </div>
  );
}
